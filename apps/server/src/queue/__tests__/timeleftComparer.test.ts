import { describe, expect, it } from "vitest";
import { TimeleftComparer } from "../timeleftComparer.js";

describe("TimeleftComparer", () => {
  const comparer = new TimeleftComparer();

  it("treats both null as equal", () => {
    expect(comparer.compare(null, null)).toBe(0);
  });

  it("sorts null after any concrete value", () => {
    expect(comparer.compare(null, 1000)).toBe(1);
    expect(comparer.compare(1000, null)).toBe(-1);
  });

  it("compares two concrete millisecond values numerically", () => {
    expect(comparer.compare(1000, 2000)).toBe(-1);
    expect(comparer.compare(2000, 1000)).toBe(1);
    expect(comparer.compare(1000, 1000)).toBe(0);
  });
});
