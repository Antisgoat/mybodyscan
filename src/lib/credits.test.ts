import { describe, it, expect } from "vitest";
import { isAdmin, formatCredits } from "./credits";

describe("credits helpers", () => {
  it("identifies admin via role", () => {
    expect(isAdmin({ role: "admin" })).toBe(true);
  });
  it("identifies admin via unlimitedCredits", () => {
    expect(isAdmin({ unlimitedCredits: true })).toBe(true);
  });
  it("formats Unlimited for admin", () => {
    expect(formatCredits({ role: "admin" })).toBe("Unlimited");
  });
  it("formats numeric credits", () => {
    expect(formatCredits({ credits: 3 })).toBe("3 credits");
    expect(formatCredits({ credits: 1 })).toBe("1 credit");
  });
  it("defaults to 0 when missing", () => {
    expect(formatCredits({})).toBe("0 credits");
  });
  it("returns null if no profile", () => {
    expect(formatCredits(null as any)).toBeNull();
  });
});
