// Deterministic, code-based scorers — no external provider required. Scores produced
// here always carry `source: "EVAL"` and a `comment` prefixed "code:<name>" so the UI
// can tell them apart from a future model-based judge (which would be prefixed
// "llm_judge:<name>" — not implemented yet, see ARCHITECTURE.md).
export const DETERMINISTIC_SCORERS = ["exact_match", "contains", "json_valid"] as const;
export type DeterministicScorerName = (typeof DETERMINISTIC_SCORERS)[number];

export interface ScorerResult {
  value: number; // 1 = pass, 0 = fail (BOOLEAN dataType)
  comment: string;
}

function stableStringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function runDeterministicScorer(
  name: DeterministicScorerName,
  output: unknown,
  expectedOutput: unknown,
): ScorerResult {
  switch (name) {
    case "exact_match": {
      const pass = stableStringify(output) === stableStringify(expectedOutput);
      return { value: pass ? 1 : 0, comment: `code:exact_match — ${pass ? "matched" : "did not match"} expected output` };
    }
    case "contains": {
      const haystack = stableStringify(output);
      const needle = stableStringify(expectedOutput);
      const pass = needle.length > 0 && haystack.includes(needle);
      return { value: pass ? 1 : 0, comment: `code:contains — expected output ${pass ? "found" : "not found"} in output` };
    }
    case "json_valid": {
      let pass = true;
      try {
        if (typeof output === "string") JSON.parse(output);
      } catch {
        pass = false;
      }
      return { value: pass ? 1 : 0, comment: `code:json_valid — output is ${pass ? "valid" : "invalid"} JSON` };
    }
  }
}

export function isDeterministicScorerName(name: string): name is DeterministicScorerName {
  return (DETERMINISTIC_SCORERS as readonly string[]).includes(name);
}
