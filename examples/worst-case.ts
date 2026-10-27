// break-ui pass: realistic worst-case data sent through the real SDK boundary (not
// hand-edited DB rows), covering long/short/unicode names, a long model id, a missing
// model, a long status message, deep/large JSON payloads, and score edge cases.
import { Spanrail } from "../sdk/index";

async function main() {
  const publicKey = process.env.SPANRAIL_PUBLIC_KEY;
  const secretKey = process.env.SPANRAIL_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error("Set SPANRAIL_PUBLIC_KEY and SPANRAIL_SECRET_KEY");
  }

  const spanrail = new Spanrail({ publicKey, secretKey, baseUrl: "http://localhost:3000" });

  const trace = spanrail.trace({
    name:
      "Investigate why the Q3-2026-northwind-industries-holdings shipment consolidation webhook silently dropped 14,000 line items during the midnight batch reconciliation job and draft a remediation plan for the on-call engineer",
    userId: "bartholomew.fitzgerald@northwind-industries-holdings.example.com",
    sessionId: "sess_01J8X7ZQKQZ9T3VWQXJ3K4M2N5-retry-after-timeout",
    tags: ["production", "high-priority", "customer-escalation-tier-1", "needs-human-review", "retried-3-times"],
  });

  // Very short name, opposite extreme from the trace name above.
  const shortSpan = trace.span({ name: "x" });
  shortSpan.end({ output: "ok" });

  // Unicode / emoji / mixed-script name.
  const unicodeSpan = trace.span({ name: "🔥 urgent: customer データ損失 escalation" });
  unicodeSpan.end({
    output: "handled",
    statusMessage:
      "RetryableError: upstream connection reset by peer after 29998ms (attempt 3/3); correlation_id=8f3e2b1a-9c4d-4e7f-9a1b-2c3d4e5f6a7b; see runbook https://runbooks.internal.example.com/incidents/shipment-webhook-timeout#step-4-escalate-to-platform-team for next steps",
    level: "ERROR",
  });

  // Long model id (realistic — matches real long model-ID conventions), to exercise
  // the top-models chart's 18-char truncation.
  const longModelGen = trace.generation({
    name: "llm:draft-remediation",
    model: "claude-opus-5-5-20261001-extended-thinking-preview",
    input: "draft a plan",
  });
  longModelGen.end({ output: "plan drafted", usageDetails: { input: 50, output: 900 }, costDetails: { input: 0.0001, output: 0.009 } });

  // Generation with NO model name at all (nullable field).
  const noModelGen = trace.generation({ name: "llm:unnamed-model", input: "x" });
  noModelGen.end({ output: "y" });

  // Deeply nested + large JSON input/output.
  let deep: Record<string, unknown> = { leaf: "bottom" };
  for (let i = 0; i < 25; i++) deep = { level: i, child: deep };
  const bigArray = Array.from({ length: 500 }, (_, i) => ({ id: i, value: `item-${i}-${"x".repeat(40)}` }));
  const deepSpan = trace.span({ name: "span:deep-and-large-payload", input: deep });
  deepSpan.end({ output: { bigArray } });

  // Score edge cases: value === 0 (must not be treated as falsy/missing), and a score
  // with neither value nor stringValue set.
  trace.score({ name: "confidence", value: 0 });
  trace.score({ name: "empty-score" });

  await spanrail.shutdown();
  console.log("Worst-case trace sent:", trace.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
