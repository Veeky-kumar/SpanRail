// Exercises the dataset + evaluation pipeline end to end: create a dataset, add items,
// produce a trace per item (simulating an agent's actual output — one deliberately
// wrong, to prove the deterministic scorer actually discriminates pass/fail rather than
// always reporting success), then link each run item and let the API's
// `exact_match` scorer write a Score automatically. The SDK has no dataset-specific
// helpers yet (noted as a gap), so this talks to the REST endpoints directly.
import { Tracewell } from "../sdk/index";

const BASE_URL = "http://localhost:3000";

async function api(path: string, publicKey: string, secretKey: string, body?: unknown) {
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const publicKey = process.env.TRACEWELL_PUBLIC_KEY;
  const secretKey = process.env.TRACEWELL_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error("Set TRACEWELL_PUBLIC_KEY and TRACEWELL_SECRET_KEY (printed by `npm run db:seed`)");
  }

  const tracewell = new Tracewell({ publicKey, secretKey, baseUrl: BASE_URL });

  const dataset = await api("/api/public/datasets", publicKey, secretKey, {
    name: `geo-qa-${Date.now()}`,
    scorers: ["exact_match"],
  });
  console.log("Created dataset:", dataset.id);

  const items = await Promise.all(
    [
      { input: "capital of France", expectedOutput: "Paris" },
      { input: "capital of Germany", expectedOutput: "Berlin" },
      { input: "capital of Japan", expectedOutput: "Tokyo" },
    ].map((i) => api(`/api/public/datasets/${dataset.id}/items`, publicKey, secretKey, i)),
  );
  console.log(`Added ${items.length} items`);

  const run = await api(`/api/public/datasets/${dataset.id}/runs`, publicKey, secretKey, { name: `run-${Date.now()}` });
  console.log("Created run:", run.id);

  // Simulated agent answers — the Japan one is deliberately wrong to prove the scorer
  // actually fails it rather than reporting a trivially-true result for everything.
  const answers: Record<string, string> = {
    "capital of France": "Paris",
    "capital of Germany": "Berlin",
    "capital of Japan": "Osaka",
  };

  for (const item of items) {
    const trace = tracewell.trace({ name: "geo-qa-agent", input: item.input });
    const generation = trace.generation({ name: "llm:answer", model: "demo-model", input: item.input });
    const output = answers[item.input as string];
    generation.end({ output });
    trace.event({ name: "final-answer", input: output });
    await tracewell.flush();

    // Give the worker a moment to materialize the trace before we link it (ingestion is
    // async by design — see ARCHITECTURE.md).
    await sleep(500);

    const linked = await api(`/api/public/datasets/${dataset.id}/runs/${run.id}/items`, publicKey, secretKey, {
      datasetItemId: item.id,
      traceId: trace.id,
      observationId: generation.id,
    });
    console.log(`Linked item ${item.id}: scores =`, linked.scoresWritten.map((s: any) => `${s.name}=${s.value}`));
  }

  console.log(`\nView comparison at ${BASE_URL}/projects/<projectId>/datasets/${dataset.id}/runs/${run.id}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
