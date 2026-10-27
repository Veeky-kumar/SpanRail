#!/usr/bin/env bash
# End-to-end check of the gateway against a real running Spanrail stack.
#
# Prerequisites (see gateway/README.md):
#   - Spanrail web + worker + Postgres + Redis running
#   - go on PATH
#   - environment: SPANRAIL_PUBLIC_KEY, SPANRAIL_SECRET_KEY
#   - optional: SPANRAIL_BASE_URL (default http://localhost:3000)
#               PSQL (command that runs psql against Spanrail's database)
#
# It starts a fake OpenAI-compatible upstream (no paid API key) and the gateway, sends
# requests through the gateway, then asserts on what Spanrail stored in Postgres.
set -euo pipefail

: "${SPANRAIL_PUBLIC_KEY:?set SPANRAIL_PUBLIC_KEY}"
: "${SPANRAIL_SECRET_KEY:?set SPANRAIL_SECRET_KEY}"
TW="${SPANRAIL_BASE_URL:-http://localhost:3000}"
PSQL="${PSQL:-docker compose -p spanrail-e2e -f ../docker-compose.yml exec -T postgres psql -U spanrail -d spanrail -t -A}"
GW_PORT="${GW_PORT:-18080}"
UP_PORT="${UP_PORT:-19000}"
RUN="e2e-$(date +%s)"   # tags every model name so reruns do not collide

cd "$(dirname "$0")/.."
mkdir -p bin
go build -o bin/gateway ./cmd/gateway
go build -o bin/fakeupstream ./cmd/fakeupstream

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

./bin/fakeupstream -addr "127.0.0.1:$UP_PORT" -latency 40ms -chunk-delay 10ms >/dev/null 2>&1 & pids+=($!)
UPSTREAM_URL="http://localhost:$UP_PORT" LISTEN_ADDR="127.0.0.1:$GW_PORT" \
SPANRAIL_BASE_URL="$TW" FLUSH_INTERVAL=300ms CAPTURE_HEADERS=true \
  ./bin/gateway >/dev/null 2>&1 & pids+=($!)
for _ in $(seq 1 30); do curl -sf "localhost:$GW_PORT/healthz" >/dev/null && break; sleep 0.2; done

fail=0
check() { # check "description" "expected" "actual"
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected '$2', got '$3')"; fail=1; fi
}
q() { $PSQL -c "$1" | tr -d '\r'; }
call() { curl -s -o /dev/null -H 'Authorization: Bearer sk-PROVIDER-KEY-must-not-leak' -H 'content-type: application/json' "$@"; }

# An existing trace the gateway should attach to.
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -s -o /dev/null -u "$SPANRAIL_PUBLIC_KEY:$SPANRAIL_SECRET_KEY" -H 'content-type: application/json' "$TW/api/public/ingestion" \
  -d "{\"batch\":[{\"id\":\"$RUN-ev\",\"timestamp\":\"$NOW\",\"type\":\"trace-create\",\"body\":{\"id\":\"$RUN-trace\",\"traceId\":\"$RUN-trace\",\"parentObservationId\":null,\"startTime\":\"$NOW\",\"name\":\"e2e-existing\"}}]}"

U="localhost:$GW_PORT/v1/chat/completions"
call "$U" -d "{\"model\":\"$RUN-fresh\"}"                                                  # first call: new upstream connection
call "$U" -d "{\"model\":\"$RUN-reused\"}"                                                 # second call: keep-alive reuse
call "$U" -d "{\"model\":\"$RUN-stream\",\"stream\":true,\"stream_options\":{\"include_usage\":true}}"
call "$U" -d "{\"model\":\"$RUN-nousage\",\"stream\":true}"
call "$U" -H "X-Spanrail-Trace-Id: $RUN-trace" -d "{\"model\":\"$RUN-attached\"}"
call "$U" -H 'X-Fake-Status: 500' -d "{\"model\":\"$RUN-err\"}"

# Wait for the gateway to flush and the worker to process.
for _ in $(seq 1 40); do
  n=$(q "select count(*) from \"Observation\" where type='GENERATION' and model like '$RUN-%' and \"endTime\" is not null")
  [ "$n" = "6" ] && break; sleep 0.5
done

check "6 generations stored"                         6 "$n"
check "fresh call: dns+connect measured"             t "$(q "select (metadata->'gateway'->'timingMs' ? 'dns' and metadata->'gateway'->'timingMs' ? 'connect') from \"Observation\" where model='$RUN-fresh'")"
check "reused call: no dns/connect/tls"              f "$(q "select (metadata->'gateway'->'timingMs' ? 'dns' or metadata->'gateway'->'timingMs' ? 'connect' or metadata->'gateway'->'timingMs' ? 'tls') from \"Observation\" where model='$RUN-reused'")"
check "reused call flagged connReused"               true "$(q "select metadata->'gateway'->>'connReused' from \"Observation\" where model='$RUN-reused'")"
check "ttfb reflects 40ms upstream latency"          t "$(q "select (metadata->'gateway'->'timingMs'->>'ttfb')::float >= 40 from \"Observation\" where model='$RUN-reused'")"
check "usage recorded (non-stream)"                  "18" "$(q "select \"usageDetails\"->>'total' from \"Observation\" where model='$RUN-fresh'")"
check "usage recorded (stream, include_usage)"      "18" "$(q "select \"usageDetails\"->>'total' from \"Observation\" where model='$RUN-stream'")"
check "usage unknown (stream without include_usage)" "" "$(q "select \"usageDetails\"::text from \"Observation\" where model='$RUN-nousage'")"
check "stream flagged"                               true "$(q "select metadata->'gateway'->>'streaming' from \"Observation\" where model='$RUN-stream'")"
check "attached to existing trace"                   "$RUN-trace" "$(q "select \"traceId\" from \"Observation\" where model='$RUN-attached'")"
check "no new root created for attached call"        0 "$(q "select count(*) from \"Observation\" where \"traceId\" in (select \"traceId\" from \"Observation\" where model='$RUN-attached') and \"parentObservationId\" is null and id <> '$RUN-trace'")"
check "upstream 500 -> ERROR level"                  ERROR "$(q "select level from \"Observation\" where model='$RUN-err'")"
check "authorization header redacted"                "[REDACTED]" "$(q "select metadata->'gateway'->'requestHeaders'->>'Authorization' from \"Observation\" where model='$RUN-fresh'")"
check "provider key stored nowhere"                  0 "$(q "select count(*) from \"Observation\" where model like '$RUN-%' and \"Observation\"::text like '%PROVIDER-KEY%'")"
check "no ingest errors"                             0 "$(q "select count(*) from \"IngestEvent\" where error is not null")"

[ "$fail" = 0 ] && echo "ALL E2E CHECKS PASSED" || { echo "E2E FAILED"; exit 1; }
