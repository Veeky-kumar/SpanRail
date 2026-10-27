import { describe, expect, it } from "vitest";
import { signupsOpen } from "./signups";

describe("signupsOpen", () => {
  it("is open unless explicitly disabled", () => {
    expect(signupsOpen({})).toBe(true);
    expect(signupsOpen({ SIGNUPS_DISABLED: "false" })).toBe(true);
    expect(signupsOpen({ SIGNUPS_DISABLED: "" })).toBe(true);
  });
  it("closes on true, 1 or yes in any case", () => {
    for (const v of ["true", "TRUE", " 1 ", "yes"]) expect(signupsOpen({ SIGNUPS_DISABLED: v })).toBe(false);
  });
});
