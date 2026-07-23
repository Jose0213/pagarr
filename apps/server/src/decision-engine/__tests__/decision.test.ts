import { describe, expect, it } from "vitest";
import { Decision } from "../decision.js";

describe("Decision", () => {
  it("accept() returns an accepted decision with no reason", () => {
    const decision = Decision.accept();
    expect(decision.accepted).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it("accept() always returns the same singleton instance", () => {
    expect(Decision.accept()).toBe(Decision.accept());
  });

  it("reject(reason) returns a rejected decision carrying the reason", () => {
    const decision = Decision.reject("Some reason");
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("Some reason");
  });

  it("reject() always returns a new instance", () => {
    expect(Decision.reject("a")).not.toBe(Decision.reject("a"));
  });
});
