import { describe, expect, it } from "vitest";
import { EstimatedCompletionTimeComparer } from "../estimatedCompletionTimeComparer.js";

describe("EstimatedCompletionTimeComparer", () => {
  const comparer = new EstimatedCompletionTimeComparer();

  it("treats both null as equal", () => {
    expect(comparer.compare(null, null)).toBe(0);
  });

  it("sorts null after any concrete value", () => {
    expect(comparer.compare(null, "2026-01-01T00:00:00.000Z")).toBe(1);
    expect(comparer.compare("2026-01-01T00:00:00.000Z", null)).toBe(-1);
  });

  it("compares two concrete timestamps chronologically", () => {
    const earlier = "2026-01-01T00:00:00.000Z";
    const later = "2026-01-02T00:00:00.000Z";
    expect(comparer.compare(earlier, later)).toBe(-1);
    expect(comparer.compare(later, earlier)).toBe(1);
    expect(comparer.compare(earlier, earlier)).toBe(0);
  });
});
