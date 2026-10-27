"""Tracewell client: queues events and sends them to /api/public/ingestion in the background.

The SDK never raises into the host application on the tracing path. A batch that cannot be sent is
retried a few times and then dropped and counted (``Tracewell.dropped``), the same trade the Go gateway
makes: losing a trace is better than slowing or breaking the call being traced.
"""

from __future__ import annotations

import atexit
import base64
import json
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("spanrail")

Json = Dict[str, Any]
LEVELS = ("DEBUG", "DEFAULT", "WARNING", "ERROR")
MAX_BATCH = 1000  # the ingestion API accepts at most 1000 events per request


def _now() -> str:
    # The API validates timestamps as UTC ISO strings ending in "Z".
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _clean(body: Json) -> Json:
    return {k: v for k, v in body.items() if v is not None}


class Tracewell:
    """Client for one Tracewell project (one public/secret key pair)."""

    def __init__(
        self,
        public_key: str,
        secret_key: str,
        base_url: str = "http://localhost:3000",
        *,
        flush_at: int = 20,
        flush_interval: float = 2.0,
        max_queue: int = 10_000,
        timeout: float = 10.0,
        retries: int = 3,
    ) -> None:
        self._auth = "Basic " + base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
        self._base = base_url.rstrip("/")
        self._flush_at = max(1, min(flush_at, MAX_BATCH))
        self._interval = flush_interval
        self._max_queue = max_queue
        self._timeout = timeout
        self._retries = retries

        self._lock = threading.Lock()
        self._queue: List[Json] = []
        self._wake = threading.Event()
        self._closed = False
        self._sending = threading.Lock()
        self.dropped = 0
        self.sent = 0

        self._thread = threading.Thread(target=self._run, name="tracewell-flush", daemon=True)
        self._thread.start()
        atexit.register(self.shutdown)

    # -- tracing -------------------------------------------------------------------------------

    def trace(
        self,
        name: Optional[str] = None,
        *,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        input: Any = None,
        metadata: Optional[Json] = None,
        trace_id: Optional[str] = None,
    ) -> "Trace":
        """Start a trace. A trace is its own root observation, so its id is also the trace id."""
        tid = trace_id or str(uuid.uuid4())
        self._enqueue(
            "trace-create",
            _clean(
                {
                    "id": tid,
                    "traceId": tid,
                    "parentObservationId": None,
                    "startTime": _now(),
                    "name": name,
                    "userId": user_id,
                    "sessionId": session_id,
                    "tags": tags,
                    "input": input,
                    "metadata": metadata,
                }
            )
            | {"parentObservationId": None},
        )
        return Trace(self, tid)

    # -- prompts -------------------------------------------------------------------------------

    def get_prompt(self, name: str, *, version: Optional[int] = None, label: Optional[str] = None) -> Json:
        """Fetch a prompt by version or label (the server defaults to the ``production`` label)."""
        query: Dict[str, str] = {}
        if version is not None:
            query["version"] = str(version)
        if label:
            query["label"] = label
        url = f"{self._base}/api/public/prompts/{urllib.parse.quote(name, safe='')}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        req = urllib.request.Request(url, headers={"authorization": self._auth})
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as err:
            raise RuntimeError(f"Tracewell get_prompt failed: {err.code} {err.read().decode(errors='replace')}") from err

    # -- delivery ------------------------------------------------------------------------------

    def flush(self) -> None:
        """Send everything queued now and wait for it. Safe to call at any time."""
        while self._send_one_batch():
            pass

    def shutdown(self) -> None:
        """Flush and stop the background thread. Called automatically at interpreter exit."""
        if self._closed:
            return
        self._closed = True
        self._wake.set()
        self._thread.join(timeout=self._timeout * (self._retries + 1))
        self.flush()

    def _enqueue(self, type_: str, body: Json) -> None:
        if self._closed:
            return
        event = {"id": str(uuid.uuid4()), "timestamp": _now(), "type": type_, "body": body}
        with self._lock:
            if len(self._queue) >= self._max_queue:
                self.dropped += 1
                return
            self._queue.append(event)
            full = len(self._queue) >= self._flush_at
        if full:
            self._wake.set()

    def _run(self) -> None:
        while not self._closed:
            self._wake.wait(self._interval)
            self._wake.clear()
            try:
                self.flush()
            except Exception:  # never let the worker thread die
                log.exception("tracewell: unexpected error while flushing")

    def _send_one_batch(self) -> bool:
        with self._sending:
            with self._lock:
                batch, self._queue = self._queue[:MAX_BATCH], self._queue[MAX_BATCH:]
            if not batch:
                return False
            if self._post(batch):
                self.sent += len(batch)
            else:
                self.dropped += len(batch)
            return True

    def _post(self, batch: List[Json]) -> bool:
        data = json.dumps({"batch": batch}, default=str).encode()
        for attempt in range(self._retries + 1):
            req = urllib.request.Request(
                f"{self._base}/api/public/ingestion",
                data=data,
                method="POST",
                headers={"content-type": "application/json", "authorization": self._auth},
            )
            try:
                with urllib.request.urlopen(req, timeout=self._timeout) as res:
                    result = json.loads(res.read() or b"{}")
                for err in result.get("errors", []):
                    log.warning("tracewell: event %s rejected (%s): %s", err.get("id"), err.get("status"), err.get("message"))
                return True
            except urllib.error.HTTPError as err:
                if err.code < 500 and err.code != 429:
                    log.warning("tracewell: ingestion rejected the batch: %s %s", err.code, err.read()[:200])
                    return False  # retrying a 4xx would not change the answer
            except Exception as err:  # network error, timeout, bad JSON
                log.debug("tracewell: ingestion attempt %d failed: %s", attempt + 1, err)
            if attempt < self._retries:
                time.sleep(min(0.2 * 2**attempt, 2.0))
        log.warning("tracewell: dropped %d events after %d attempts", len(batch), self._retries + 1)
        return False


class _Node:
    """Shared behaviour of anything that can hold children: a trace, a span or a generation."""

    def __init__(self, client: Tracewell, trace_id: str, id_: str) -> None:
        self._client = client
        self.trace_id = trace_id
        self.id = id_

    def span(self, name: Optional[str] = None, *, input: Any = None, metadata: Optional[Json] = None) -> "Span":
        sid = str(uuid.uuid4())
        self._client._enqueue("span-create", self._child(sid, name=name, input=input, metadata=metadata))
        return Span(self._client, self.trace_id, sid)

    def generation(
        self,
        name: Optional[str] = None,
        *,
        model: Optional[str] = None,
        model_parameters: Optional[Json] = None,
        input: Any = None,
        metadata: Optional[Json] = None,
        prompt_name: Optional[str] = None,
        prompt_version: Optional[int] = None,
    ) -> "Generation":
        gid = str(uuid.uuid4())
        self._client._enqueue(
            "generation-create",
            self._child(
                gid,
                name=name,
                model=model,
                modelParameters=model_parameters,
                input=input,
                metadata=metadata,
                promptName=prompt_name,
                promptVersion=prompt_version,
            ),
        )
        return Generation(self._client, self.trace_id, gid)

    def event(
        self,
        name: Optional[str] = None,
        *,
        input: Any = None,
        level: Optional[str] = None,
        metadata: Optional[Json] = None,
    ) -> None:
        self._client._enqueue(
            "event-create",
            self._child(str(uuid.uuid4()), name=name, input=input, level=level, metadata=metadata),
        )

    def score(
        self,
        name: str,
        value: Optional[float] = None,
        *,
        string_value: Optional[str] = None,
        comment: Optional[str] = None,
    ) -> None:
        body: Json = {"id": str(uuid.uuid4()), "traceId": self.trace_id, "name": name}
        if not isinstance(self, Trace):
            body["observationId"] = self.id
        self._client._enqueue(
            "score-create",
            _clean(body | {"value": value, "stringValue": string_value, "comment": comment}),
        )

    def _child(self, id_: str, **fields: Any) -> Json:
        return _clean(
            {"id": id_, "traceId": self.trace_id, "parentObservationId": self.id, "startTime": _now(), **fields}
        )


class Trace(_Node):
    def __init__(self, client: Tracewell, trace_id: str) -> None:
        super().__init__(client, trace_id, trace_id)


class _Ended(_Node):
    _update_type = ""

    def _end(self, error: Optional[BaseException] = None, **fields: Any) -> None:
        if error is not None and fields.get("level") is None:
            fields["level"] = "ERROR"
            fields["statusMessage"] = fields.get("statusMessage") or f"{type(error).__name__}: {error}"
        body = {"id": self.id, "traceId": self.trace_id, "endTime": _now(), **fields}
        self._client._enqueue(self._update_type, _clean(body))

    # Used as ``with trace.span("x") as s:``; an exception inside the block marks it as an error.
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if not getattr(self, "_ended", False):
            self.end(error=exc)
        return False


class Span(_Ended):
    _update_type = "span-update"

    def end(
        self,
        *,
        output: Any = None,
        level: Optional[str] = None,
        status_message: Optional[str] = None,
        metadata: Optional[Json] = None,
        error: Optional[BaseException] = None,
    ) -> None:
        self._ended = True
        self._end(error, output=output, level=level, statusMessage=status_message, metadata=metadata)


class Generation(_Ended):
    _update_type = "generation-update"

    def end(
        self,
        *,
        output: Any = None,
        usage: Optional[Dict[str, float]] = None,
        cost: Optional[Dict[str, float]] = None,
        level: Optional[str] = None,
        status_message: Optional[str] = None,
        metadata: Optional[Json] = None,
        error: Optional[BaseException] = None,
    ) -> None:
        self._ended = True
        self._end(
            error,
            output=output,
            usageDetails=usage,
            costDetails=cost,
            level=level,
            statusMessage=status_message,
            metadata=metadata,
        )
