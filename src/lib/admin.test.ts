import { describe, expect, it } from "vitest";
import { isAdminEmail } from "./admin";

describe("isAdminEmail", () => {
  it("matches a listed address, ignoring case and spaces around the list", () => {
    expect(isAdminEmail("Me@Example.com", " me@example.com , other@x.io ")).toBe(true);
  });

  it("is false when the list is empty or unset, so nobody is an admin by default", () => {
    expect(isAdminEmail("me@example.com", "")).toBe(false);
    expect(isAdminEmail("me@example.com", undefined)).toBe(false);
  });

  it("is false for no email, and does not match on a substring", () => {
    expect(isAdminEmail(null, "me@example.com")).toBe(false);
    expect(isAdminEmail("me@example.com.evil.io", "me@example.com")).toBe(false);
    expect(isAdminEmail("xme@example.com", "me@example.com")).toBe(false);
  });
});
