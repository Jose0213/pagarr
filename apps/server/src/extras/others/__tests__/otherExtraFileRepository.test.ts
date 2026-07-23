import { describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { OtherExtraFileRepository } from "../otherExtraFileRepository.js";
import { newOtherExtraFile } from "../otherExtraFile.js";

function makeDatabase(): MainDatabase {
  return createMainDatabase(":memory:");
}

/**
 * PRESERVED UPSTREAM BUG (see otherExtraFile.ts's module doc comment): the
 * real Readarr migration history never creates an `OtherExtraFiles` table.
 * This proves the faithfully-ported repository fails the same way the real
 * C# would against a real Readarr database -- a SQL-level failure, not a
 * silently-wrong result.
 */
describe("OtherExtraFileRepository (preserved missing-table quirk)", () => {
  it("throws when querying, because the OtherExtraFiles table doesn't exist in any real migration", () => {
    const repo = new OtherExtraFileRepository(makeDatabase());

    expect(() => repo.all()).toThrow(/no such table/i);
  });

  it("throws when inserting", () => {
    const repo = new OtherExtraFileRepository(makeDatabase());

    expect(() => repo.insert(newOtherExtraFile({ authorId: 1, relativePath: "a.jpg" }))).toThrow(
      /no such table/i
    );
  });
});
