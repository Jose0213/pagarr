import { describe, expect, it } from "vitest";
import { resolveLogLevels, resolveFileTargetLevels } from "../reconfigureLogging.js";

/**
 * Ported behavior from ReconfigureLogging.Reconfigure()'s level-resolution
 * branch (see reconfigureLogging.ts's doc comment for why only this part of
 * the C# class is portable independent of a real NLog integration).
 */
describe("resolveLogLevels", () => {
  it("uses the configured logLevel as minimumLogLevel", () => {
    const result = resolveLogLevels({ logLevel: "debug", consoleLogLevel: "" });
    expect(result.minimumLogLevel).toBe("debug");
  });

  it("defaults the console level to Info when logLevel is at or more verbose than Info and no console override is set", () => {
    // NLog ordinal ordering: Trace < Debug < Info < Warn < Error < Fatal.
    // "minimumLogLevel > LogLevel.Info" is false for Trace/Debug/Info, so
    // the console falls back to Info in all three cases.
    expect(resolveLogLevels({ logLevel: "info", consoleLogLevel: "" }).minimumConsoleLogLevel).toBe(
      "info"
    );
    expect(
      resolveLogLevels({ logLevel: "debug", consoleLogLevel: "" }).minimumConsoleLogLevel
    ).toBe("info");
    expect(
      resolveLogLevels({ logLevel: "trace", consoleLogLevel: "" }).minimumConsoleLogLevel
    ).toBe("info");
  });

  it("uses the (less verbose) file log level for console when logLevel is less verbose than Info and no console override is set", () => {
    // "minimumLogLevel > LogLevel.Info" is true for Warn/Error/Fatal, so the
    // console adopts that stricter level instead of the Info default.
    expect(resolveLogLevels({ logLevel: "warn", consoleLogLevel: "" }).minimumConsoleLogLevel).toBe(
      "warn"
    );
    expect(
      resolveLogLevels({ logLevel: "error", consoleLogLevel: "" }).minimumConsoleLogLevel
    ).toBe("error");
    expect(
      resolveLogLevels({ logLevel: "fatal", consoleLogLevel: "" }).minimumConsoleLogLevel
    ).toBe("fatal");
  });

  it("prefers an explicit consoleLogLevel override over the derived default", () => {
    const result = resolveLogLevels({ logLevel: "info", consoleLogLevel: "error" });
    expect(result.minimumConsoleLogLevel).toBe("error");
  });

  it("treats a whitespace-only consoleLogLevel as unset (IsNotNullOrWhiteSpace semantics)", () => {
    const result = resolveLogLevels({ logLevel: "warn", consoleLogLevel: "   " });
    expect(result.minimumConsoleLogLevel).toBe("warn");
  });

  it("is case-insensitive, matching LogLevel.FromString", () => {
    const result = resolveLogLevels({ logLevel: "DEBUG", consoleLogLevel: "ERROR" });
    expect(result.minimumLogLevel).toBe("debug");
    expect(result.minimumConsoleLogLevel).toBe("error");
  });

  it("throws for an unknown log level, matching LogLevel.FromString's throw-on-unknown behavior", () => {
    expect(() => resolveLogLevels({ logLevel: "bogus", consoleLogLevel: "" })).toThrow();
  });
});

describe("resolveFileTargetLevels", () => {
  it("enables only appFileInfo at the Info level", () => {
    expect(resolveFileTargetLevels("info")).toEqual({
      appFileInfo: true,
      appFileDebug: false,
      appFileTrace: false,
    });
  });

  it("enables appFileInfo and appFileDebug at the Debug level", () => {
    expect(resolveFileTargetLevels("debug")).toEqual({
      appFileInfo: true,
      appFileDebug: true,
      appFileTrace: false,
    });
  });

  it("enables all three at the Trace level", () => {
    expect(resolveFileTargetLevels("trace")).toEqual({
      appFileInfo: true,
      appFileDebug: true,
      appFileTrace: true,
    });
  });

  it("disables all three above Info (e.g. Warn)", () => {
    expect(resolveFileTargetLevels("warn")).toEqual({
      appFileInfo: false,
      appFileDebug: false,
      appFileTrace: false,
    });
  });
});
