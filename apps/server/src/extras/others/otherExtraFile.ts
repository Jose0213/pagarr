import type { ExtraFile } from "../extraFile.js";

/**
 * Ported from NzbDrone.Core/Extras/Others/OtherExtraFile.cs. Adds no fields
 * of its own beyond `ExtraFile`.
 *
 * PRESERVED UPSTREAM QUIRK: unlike `MetadataFiles` (see
 * metadata/metadataFileRepository.ts), there is NO `OtherExtraFiles` table
 * anywhere in Readarr's real migration history (grepped the full
 * `NzbDrone.Core.Test`-adjacent migration source tree: zero hits for
 * `OtherExtraFiles` outside this module itself). `OtherExtraFileRepository`/
 * `OtherExtraFileService` are real, wired-up C# classes that would throw a
 * SQL error against a real Readarr database the moment anything called
 * them -- this looks like a genuine shipped bug/dead-code path in upstream
 * Readarr (`Others` was seemingly never fully wired into the release build,
 * consistent with `ExistingOtherExtraImporter.Order => 2` colliding with
 * `OtherExtraService.Order => 2` and neither ever being registered in the
 * DI composition root that ships). Ported faithfully per this task's "known
 * bugs get fixed later, separately" instruction: this port's
 * `others/otherExtraFileRepository.ts` targets a `"OtherExtraFiles"` table
 * that genuinely has no migration, and will throw a SQLite "no such table"
 * error the same way the real C# would throw a SQL error, if ever executed
 * against a real on-disk Pagarr database. Not fixed here.
 */
export type OtherExtraFile = ExtraFile;

export function newOtherExtraFile(overrides: Partial<OtherExtraFile> = {}): OtherExtraFile {
  return {
    id: 0,
    authorId: 0,
    bookFileId: null,
    bookId: null,
    relativePath: "",
    added: "",
    lastUpdated: "",
    extension: "",
    ...overrides,
  };
}
