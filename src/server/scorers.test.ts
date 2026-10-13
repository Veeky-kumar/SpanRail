import { describe, it, expect } from "vitest";
import { runDeterministicScorer, isDeterministicScorerName } from "./scorers";

describe("exact_match", () => {
  it("passes when output equals expected", () => {
    expect(runDeterministicScorer("exact_match", "Paris", "Paris").value).toBe(1);
  });

  it("fails when output differs from expected", () => {
    expect(runDeterministicScorer("exact_match", "Osaka", "Tokyo").value).toBe(0);
  });

  it("compares non-string values by JSON structure", () => {
    expect(runDeterministicScorer("exact_match", { a: 1 }, { a: 1 }).value).toBe(1);
    expect(runDeterministicScorer("exact_match", { a: 1 }, { a: 2 }).value).toBe(0);
  });

  it("treats null and undefined output as a mismatch against a real expected value", () => {
    expect(runDeterministicScorer("exact_match", null, "Paris").value).toBe(0);
    expect(runDeterministicScorer("exact_match", undefined, "Paris").value).toBe(0);
  });
});

describe("contains", () => {
  it("passes when the expected substring is present", () => {
    expect(runDeterministicScorer("contains", "The capital is Paris, France", "Paris").value).toBe(1);
  });

  it("fails when the expected substring is absent", () => {
    expect(runDeterministicScorer("contains", "The capital is Berlin", "Paris").value).toBe(0);
  });

  it("never trivially passes on an empty expected value", () => {
    expect(runDeterministicScorer("contains", "anything at all", "").value).toBe(0);
  });
});

describe("json_valid", () => {
  it("passes for a parseable JSON string", () => {
    expect(runDeterministicScorer("json_valid", '{"a":1}', undefined).value).toBe(1);
  });

  it("fails for a malformed JSON string", () => {
    expect(runDeterministicScorer("json_valid", "{a: 1,}", undefined).value).toBe(0);
  });

  it("passes non-string output unconditionally (already a parsed structure)", () => {
    expect(runDeterministicScorer("json_valid", { a: 1 }, undefined).value).toBe(1);
  });
});

describe("isDeterministicScorerName", () => {
  it("accepts known scorer names", () => {
    expect(isDeterministicScorerName("exact_match")).toBe(true);
    expect(isDeterministicScorerName("contains")).toBe(true);
    expect(isDeterministicScorerName("json_valid")).toBe(true);
  });

  it("rejects unknown names, including a reserved llm_judge: prefix", () => {
    expect(isDeterministicScorerName("llm_judge:gpt4")).toBe(false);
    expect(isDeterministicScorerName("made_up_scorer")).toBe(false);
  });
});
