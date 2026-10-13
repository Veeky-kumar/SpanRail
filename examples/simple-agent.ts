// Exercises the full pipeline: SDK -> ingestion API -> queue -> worker -> Postgres.
// Simulates a small multi-agent workflow: a planner span that calls two tools (one of
// which fails) and an LLM generation, nested exactly the way a real agent trace would
// nest them, so the dashboard's tree-building and waterfall view have something real to
// render.
import { Tracewell } from "../sdk/index";

async function main() {
  const publicKey = process.env.TRACEWELL_PUBLIC_KEY;
  const secretKey = process.env.TRACEWELL_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error("Set TRACEWELL_PUBLIC_KEY and TRACEWELL_SECRET_KEY (printed by `npm run db:seed`)");
  }

  const tracewell = new Tracewell({ publicKey, secretKey, baseUrl: process.env.TRACEWELL_BASE_URL ?? "http://localhost:3000" });

  const trace = tracewell.trace({
    name: "research-agent-run",
    userId: "user_42",
    sessionId: "session_7",
    tags: ["demo", "multi-agent"],
    input: { question: "What's the weather-adjusted ETA for the shipment?" },
  });

  const planner = trace.span({ name: "agent:planner", input: { question: "weather-adjusted ETA" } });
  await sleep(40);

  const weatherTool = planner.span({ name: "tool:get_weather", input: { city: "Austin" } });
  await sleep(120);
  weatherTool.end({ output: { tempF: 94, condition: "clear" } });

  const etaTool = planner.span({ name: "tool:get_shipment_eta", input: { trackingId: "1Z-DEMO" } });
  await sleep(80);
  // Simulate a failure to exercise error-status rendering end to end.
  etaTool.end({ output: null, level: "ERROR", statusMessage: "Carrier API timed out after 2 retries" });

  const generation = planner.generation({
    name: "llm:summarize",
    model: "gpt-4o-mini",
    modelParameters: { temperature: 0.2 },
    input: { prompt: "Given clear weather and a carrier API timeout, draft a status update." },
  });
  await sleep(200);
  generation.end({
    output: { text: "Weather is clear; carrier ETA is temporarily unavailable, retrying shortly." },
    usageDetails: { input: 128, output: 42, total: 170 },
    costDetails: { input: 0.0000648, output: 0.0000378 },
  });

  planner.end({ output: { summary: "Partial result due to carrier API timeout" } });

  trace.score({ name: "user_feedback", value: 1, comment: "Correctly flagged the carrier timeout" });

  await tracewell.shutdown();
  console.log("Trace sent:", trace.id);
  console.log(`View it at http://localhost:3000/projects/<projectId>/traces/${trace.id}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
