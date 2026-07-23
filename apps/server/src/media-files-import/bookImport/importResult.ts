import type { LocalBook } from "../../parser/model/localBook.js";
import { ImportDecision } from "./importDecision.js";
import { ImportResultType } from "../importResultType.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/ImportResult.cs. */
export class ImportResult {
  readonly importDecision: ImportDecision<LocalBook>;
  readonly errors: string[];

  /**
   * Ported from the `Ensure.That(importDecision, () =>
   * importDecision).IsNotNull()` constructor guard: throws if
   * `importDecision` is null/undefined.
   */
  constructor(importDecision: ImportDecision<LocalBook>, ...errors: string[]) {
    if (importDecision === null || importDecision === undefined) {
      throw new Error("importDecision must not be null");
    }

    this.importDecision = importDecision;
    this.errors = [...errors];
  }

  /**
   * Ported from `ImportResult.Result`: Skipped when there are errors but
   * the decision was still Approved (e.g. "Book has already been
   * imported"), Rejected when there are errors and the decision was NOT
   * approved, Imported when there are no errors at all.
   */
  get result(): ImportResultType {
    if (this.errors.length > 0) {
      if (this.importDecision.approved) {
        return ImportResultType.Skipped;
      }

      return ImportResultType.Rejected;
    }

    return ImportResultType.Imported;
  }
}
