#!/usr/bin/env bash
# Measures the latency the gateway adds, and its event-reporting throughput.
#
# Method: a closed-loop load generator (cmd/bench) sends the same POST requests
#   (a) directly to a fake OpenAI-compatible upstream,
#   (b) through the gateway with reporting disabled (pure proxy + observation overhead),
#   (c) through the gateway with reporting on, to a fast fake Spanrail sink.
# Everything runs on one machine over loopback, so numbers show the gateway's own overhead,
# not network cost, and the load generator competes with the servers for CPU.
# Each configuration is run REPS times; the script prints every run so nothing is hidden.
#
# Two upstream latencies are used. With 0 ms the upstream answers instantly, which maximises the
# gateway's relative cost and gives throughput numbers. On some machines (this project's Windows
# box: the Go clock steps in ~0.54 ms) sub-millisecond percentiles are quantised, so a second pass
# with a 20 ms upstream puts the overhead well above the clock resolution.
set -euo pipefail
cd "$(dirname "$0")/.."

REPS="${REPS:-3}"; EXE="$(go env GOEXE)"
go build -o "bin/gateway$EXE" ./cmd/gateway
go build -o "bin/fakeupstream$EXE" ./cmd/fakeupstream
go build -o "bin/fakespanrail$EXE" ./cmd/fakespanrail
go build -o "bin/bench$EXE" ./cmd/bench

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

UP=127.0.0.1:9100; GW=127.0.0.1:9101; TW=127.0.0.1:9102
"./bin/fakespanrail$EXE" -addr "$TW" >/dev/null 2>&1 & pids+=($!)

start_gateway() { # start_gateway [env...]; sets GWPID
  env UPSTREAM_URL="http://$UP" LISTEN_ADDR="$GW" "$@" "./bin/gateway$EXE" >/dev/null 2>&1 &
  GWPID=$!; pids+=($GWPID)
  for _ in $(seq 1 50); do curl -sf "http://$GW/healthz" >/dev/null && break; sleep 0.1; done
}
stop_gateway() { kill "$GWPID" 2>/dev/null || true; wait "$GWPID" 2>/dev/null || true; }

run_set() { # run_set <label> <url> <n at c=1> <n at c=32>
  for c in 1 32; do
    n=$3; [ "$c" = 32 ] && n=$4
    for r in $(seq 1 "$REPS"); do
      "./bin/bench$EXE" -url "$2" -n "$n" -c "$c" -label "$1 #$r"
    done
  done
}

suite() { # suite <upstream latency> <n at c=1> <n at c=32>
  echo "######## upstream latency $1"
  "./bin/fakeupstream$EXE" -addr "$UP" -latency "$1" >/dev/null 2>&1 & local up=$!; pids+=($up); sleep 1

  echo "### (a) direct to upstream"
  run_set "direct" "http://$UP/v1/chat/completions" "$2" "$3"

  echo "### (b) via gateway, reporting disabled"
  start_gateway REPORT_ENABLED=false
  run_set "gateway(no-report)" "http://$GW/v1/chat/completions" "$2" "$3"
  stop_gateway

  echo "### (c) via gateway, reporting to a fast fake Spanrail"
  curl -s "http://$TW/stats" >/dev/null
  start_gateway SPANRAIL_BASE_URL="http://$TW" SPANRAIL_PUBLIC_KEY=pk SPANRAIL_SECRET_KEY=sk FLUSH_INTERVAL=200ms QUEUE_SIZE=100000
  run_set "gateway(report)" "http://$GW/v1/chat/completions" "$2" "$3"
  sleep 1
  echo "gateway reporter metrics after (c):"
  curl -s "http://$GW/metrics" | grep -E "^spanrail_gateway_report_(events_sent|dropped|flush_failures)_total"
  echo "fake spanrail received: $(curl -s "http://$TW/stats")"
  stop_gateway
  kill "$up" 2>/dev/null || true; wait "$up" 2>/dev/null || true
}

suite 0ms 20000 20000
suite 20ms 1500 20000
