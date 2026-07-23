import { describe, expect, it } from "vitest";
import { Rejection } from "../rejection.js";
import { RejectionType } from "../rejectionType.js";

/** Ported from the C# Rejection.cs behavior (no dedicated fixture in the C# source; covered indirectly via DownloadDecision tests). */
describe("Rejection", () => {
  it("defaults to Permanent", () => {
    const rejection = new Rejection("reason");
    expect(rejection.type).toBe(RejectionType.Permanent);
  });

  it("toString() formats as [{Type}] {Reason}", () => {
    const rejection = new Rejection("Sample", RejectionType.Temporary);
    expect(rejection.toString()).toBe("[Temporary] Sample");
  });

  it("toString() for Permanent", () => {
    const rejection = new Rejection("Bad quality");
    expect(rejection.toString()).toBe("[Permanent] Bad quality");
  });
});
