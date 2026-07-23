import { describe, expect, it } from "vitest";
import { CommandPriorityComparer } from "../commandPriorityComparer.js";
import { CommandStatus } from "../commandStatus.js";

describe("CommandPriorityComparer", () => {
  const comparer = new CommandPriorityComparer();

  it("always sorts Started before any other status", () => {
    expect(comparer.compare(CommandStatus.Started, CommandStatus.Queued)).toBeLessThan(0);
    expect(comparer.compare(CommandStatus.Queued, CommandStatus.Started)).toBeGreaterThan(0);
    // Even though Queued (0) < Started (1) numerically, Started still wins.
    expect(comparer.compare(CommandStatus.Started, CommandStatus.Failed)).toBeLessThan(0);
  });

  it("falls back to plain numeric enum ordering when neither is Started", () => {
    expect(comparer.compare(CommandStatus.Queued, CommandStatus.Completed)).toBeLessThan(0);
    expect(comparer.compare(CommandStatus.Failed, CommandStatus.Queued)).toBeGreaterThan(0);
    expect(comparer.compare(CommandStatus.Completed, CommandStatus.Completed)).toBe(0);
  });

  it("returns 0 when both are Started", () => {
    expect(comparer.compare(CommandStatus.Started, CommandStatus.Started)).toBe(0);
  });
});
