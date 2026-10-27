import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from spanrail import Tracewell


class Server:
    """A tiny stand-in for the ingestion API that records what it receives."""

    def __init__(self, statuses=None):
        self.batches = []
        self.auth = []
        self.statuses = list(statuses or [])
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers["content-length"]))
                outer.auth.append(self.headers["authorization"])
                status = outer.statuses.pop(0) if outer.statuses else 207
                if status == 207:
                    outer.batches.append(json.loads(body)["batch"])
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"successes":[],"errors":[]}')

            def do_GET(self):
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"path": self.path, "name": "p"}).encode())

            def log_message(self, *a):
                pass

        self.httpd = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    @property
    def events(self):
        return [e for b in self.batches for e in b]


@pytest.fixture
def server():
    s = Server()
    yield s
    s.httpd.shutdown()


def client(server, **kw):
    return Tracewell("pk", "sk", server.url, flush_interval=60, retries=2, **kw)


def test_trace_tree_and_event_shapes(server):
    tw = client(server)
    trace = tw.trace("chat", user_id="u1", tags=["a"])
    gen = trace.generation("llm", model="m", model_parameters={"t": 0})
    gen.end(output="hi", usage={"input": 3, "output": 4}, cost={"total": 0.5})
    tw.flush()

    by_type = {e["type"]: e["body"] for e in server.events}
    root = by_type["trace-create"]
    assert root["id"] == root["traceId"] and root["parentObservationId"] is None
    assert root["userId"] == "u1" and root["startTime"].endswith("Z")
    create = by_type["generation-create"]
    assert create["parentObservationId"] == root["id"] and create["modelParameters"] == {"t": 0}
    update = by_type["generation-update"]
    assert update["id"] == create["id"]
    assert update["usageDetails"] == {"input": 3, "output": 4} and update["costDetails"] == {"total": 0.5}


def test_none_fields_are_omitted_and_unknown_is_never_zero(server):
    tw = client(server)
    tw.trace().generation().end()
    tw.flush()
    update = next(e["body"] for e in server.events if e["type"] == "generation-update")
    assert "usageDetails" not in update and "costDetails" not in update and "output" not in update


def test_basic_auth_header(server):
    tw = client(server)
    tw.trace("x")
    tw.flush()
    assert server.auth[0] == "Basic " + base64.b64encode(b"pk:sk").decode()


def test_context_manager_marks_exceptions_as_errors(server):
    tw = client(server)
    trace = tw.trace()
    with pytest.raises(ValueError):
        with trace.span("work"):
            raise ValueError("boom")
    with trace.span("fine"):
        pass
    tw.flush()
    updates = [e["body"] for e in server.events if e["type"] == "span-update"]
    assert updates[0]["level"] == "ERROR" and updates[0]["statusMessage"] == "ValueError: boom"
    assert "level" not in updates[1]


def test_ending_inside_the_block_is_not_repeated(server):
    tw = client(server)
    with tw.trace().span("s") as s:
        s.end(output="done")
    tw.flush()
    assert len([e for e in server.events if e["type"] == "span-update"]) == 1


def test_scores(server):
    tw = client(server)
    trace = tw.trace()
    gen = trace.generation()
    trace.score("overall", 1)
    gen.score("rel", 0)
    tw.flush()
    scores = [e["body"] for e in server.events if e["type"] == "score-create"]
    assert "observationId" not in scores[0] and scores[0]["value"] == 1
    assert scores[1]["observationId"] == gen.id and scores[1]["value"] == 0  # 0 is kept, not dropped


def test_batches_are_capped_at_1000(server):
    tw = client(server, flush_at=1000)
    trace = tw.trace()
    for _ in range(1500):
        trace.event("e")
    tw.flush()
    assert [len(b) for b in server.batches] == [1000, 501]


def test_retries_a_server_error_then_succeeds():
    s = Server(statuses=[503, 207])
    try:
        tw = client(s)
        tw.trace("x")
        tw.flush()
        assert tw.sent == 1 and tw.dropped == 0 and len(s.batches) == 1
    finally:
        s.httpd.shutdown()


def test_a_bad_key_is_dropped_without_retry_and_never_raises():
    s = Server(statuses=[401, 207])
    try:
        tw = client(s)
        tw.trace("x")
        tw.flush()
        assert tw.dropped == 1 and s.batches == []
    finally:
        s.httpd.shutdown()


def test_unreachable_server_never_raises_into_the_app():
    tw = Tracewell("pk", "sk", "http://127.0.0.1:9", flush_interval=60, retries=1, timeout=0.5)
    tw.trace("x").generation().end()
    tw.flush()
    assert tw.dropped == 3 and tw.sent == 0


def test_full_queue_drops_and_counts():
    tw = Tracewell("pk", "sk", "http://127.0.0.1:9", flush_interval=60, max_queue=2, flush_at=1000)
    for _ in range(5):
        tw.trace()
    assert tw.dropped == 3


def test_background_thread_flushes_by_itself(server):
    tw = Tracewell("pk", "sk", server.url, flush_at=1, flush_interval=60)
    tw.trace("x")
    for _ in range(100):
        if server.events:
            break
        threading.Event().wait(0.05)
    assert len(server.events) == 1


def test_get_prompt_builds_the_url(server):
    tw = client(server)
    got = tw.get_prompt("support agent", version=2, label="production")
    assert got["path"].startswith("/api/public/prompts/support%20agent?")
    assert "version=2" in got["path"] and "label=production" in got["path"]
