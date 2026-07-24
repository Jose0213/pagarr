import { describe, expect, it } from "vitest";
import { logToResource } from "../LogResource.js";
import type { Log } from "../../../../instrumentation/log.js";

describe("logToResource", () => {
  it("lower-cases the level", () => {
    const log: Log = {
      id: 1,
      message: "hi",
      time: "2026-01-01T00:00:00.000Z",
      logger: "Test",
      exception: null,
      exceptionType: null,
      level: "Warn",
    };

    expect(logToResource(log).level).toBe("warn");
  });

  it("never sets method, matching the real mapper's own gap", () => {
    const log: Log = {
      id: 1,
      message: "hi",
      time: "2026-01-01T00:00:00.000Z",
      logger: "Test",
      exception: null,
      exceptionType: null,
      level: "Info",
    };

    expect(logToResource(log).method).toBeUndefined();
  });
});
