import { describe, expect, it } from "vitest";
import { ImportDecision, Rejection } from "../bookImport/importDecision.js";
import { ImportResult } from "../bookImport/importResult.js";
import { ImportResultType } from "../importResultType.js";
import { newLocalBook } from "../../parser/model/localBook.js";

describe("ImportDecision", () => {
  it("approved is true with no rejections", () => {
    const decision = new ImportDecision(newLocalBook());
    expect(decision.approved).toBe(true);
    expect(decision.rejections).toEqual([]);
  });

  it("approved is false once a rejection is added", () => {
    const decision = new ImportDecision(newLocalBook());
    decision.reject(new Rejection("nope"));
    expect(decision.approved).toBe(false);
    expect(decision.rejections).toHaveLength(1);
    expect(decision.rejections[0]!.reason).toBe("nope");
  });

  it("constructor accepts initial rejections", () => {
    const decision = new ImportDecision(newLocalBook(), new Rejection("a"), new Rejection("b"));
    expect(decision.approved).toBe(false);
    expect(decision.rejections.map((r) => r.reason)).toEqual(["a", "b"]);
  });
});

describe("ImportResult", () => {
  it("throws when constructed with a null/undefined decision (ported from Ensure.That)", () => {
    // @ts-expect-error -- deliberately passing an invalid value to exercise the guard.
    expect(() => new ImportResult(null)).toThrow();
  });

  it("result is Imported when there are no errors", () => {
    const decision = new ImportDecision(newLocalBook());
    const result = new ImportResult(decision);
    expect(result.result).toBe(ImportResultType.Imported);
    expect(result.errors).toEqual([]);
  });

  it("result is Skipped when there are errors but the decision was approved", () => {
    const decision = new ImportDecision(newLocalBook());
    const result = new ImportResult(decision, "already imported");
    expect(result.result).toBe(ImportResultType.Skipped);
  });

  it("result is Rejected when there are errors and the decision was not approved", () => {
    const decision = new ImportDecision(newLocalBook(), new Rejection("bad match"));
    const result = new ImportResult(decision, "failed to import");
    expect(result.result).toBe(ImportResultType.Rejected);
  });
});
