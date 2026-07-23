import { describe, expect, it, vi } from "vitest";
import { TrimLogDatabase } from "../housekeepers/trimLogDatabase.js";
import type { LogRepository } from "../../instrumentation/logRepository.js";

/** Ported from NzbDrone.Core/Housekeeping/Housekeepers/TrimLogDatabase.cs. */
describe("TrimLogDatabase", () => {
  it("delegates to logRepository.trim()", () => {
    const trim = vi.fn();
    const logRepo = { trim } as unknown as Pick<LogRepository, "trim">;

    new TrimLogDatabase(logRepo).clean();

    expect(trim).toHaveBeenCalledTimes(1);
  });
});
