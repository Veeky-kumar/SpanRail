import { describe, expect, it } from "vitest";
import { CHANGELOG, recentChanges } from "./changelog";

describe("CHANGELOG", () => {
  it("has real, parseable dates, newest first", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(entry.date))).toBe(false);
    }
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("has a title for every entry, and no duplicates", () => {
    const titles = CHANGELOG.map((e) => e.title);
    expect(titles.every((t) => t.trim().length > 0)).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("returns only the most recent entries when asked for fewer", () => {
    expect(recentChanges(3)).toEqual(CHANGELOG.slice(0, 3));
    expect(recentChanges(0)).toEqual([]);
    expect(recentChanges(999)).toHaveLength(CHANGELOG.length);
  });
});
