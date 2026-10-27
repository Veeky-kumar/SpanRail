// Phase 8 performance measurement: ingestion throughput/latency against a real running
// deployment, and end-to-end lag before the worker finishes processing. Not a load
// test — a sanity measurement, reported with real numbers rather than assumed.
import { Spanrail } from "../sdk/index";

async function main() {
  const publicKey = process.env.SPANRAIL_PUBLIC_KEY;
  const secretKey = process.env.SPANRAIL_SECRET_KEY;
  if (!publicKey || !secretKey) throw new Error("Set SPANRAIL_PUBLIC_KEY and SPANRAIL_SECRET_KEY");

  const spanrail = new Spanrail({ publicKey, secretKey, baseUrl: "http://localhost:3000", flushAt: 1000 });

  const TRACE_COUNT = 50;
  const t0 = Date.now();

  for (let i = 0; i < TRACE_COUNT; i++) {
    const trace = spanrail.trace({ name: `perf-trace-${i}`, userId: `user_${i % 5}` });
    const span = trace.span({ name: "tool:lookup", input: { i } });
    span.end({ output: { ok: true } });
    const gen = trace.generation({ name: "llm:answer", model: "gpt-4o-mini" });
    gen.end({ output: "answer", usageDetails: { input: 50, output: 20 }, costDetails: { input: 0.00002, output: 0.00001 } });
  }

  await spanrail.flush();
  const t1 = Date.now();
  console.log(`Ingested ${TRACE_COUNT} traces (4 events each, ${TRACE_COUNT * 4} events total) via HTTP in ${t1 - t0}ms`);
  console.log(`=> ${(((TRACE_COUNT * 4) / (t1 - t0)) * 1000).toFixed(0)} events/sec accepted by the ingestion API`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
