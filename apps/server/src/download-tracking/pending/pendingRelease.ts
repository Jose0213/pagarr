import type { ModelBase } from "../../db/model-base.js";
import type { ParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import type { ReleaseInfo, ReleaseSourceType } from "../../parser/model/releaseInfo.js";
import type { RemoteBook } from "../../parser/model/remoteBook.js";
import { PendingReleaseReason } from "./pendingReleaseReason.js";

/** Ported from NzbDrone.Core/Download/Pending/PendingRelease.cs's nested `PendingReleaseAdditionalInfo`. */
export interface PendingReleaseAdditionalInfo {
  releaseSource: ReleaseSourceType;
}

/**
 * Ported from NzbDrone.Core/Download/Pending/PendingRelease.cs. Backing
 * table: PendingReleases (see db/migrations/0001_initial_setup.sql, which
 * declares only Id/Title/Added/Release/AuthorId/ParsedBookInfo/Reason --
 * matching the real Readarr migration `001_initial_setup.cs`).
 *
 * `remoteBook` (C# `//Not persisted public RemoteBook RemoteBook`) is kept
 * as an in-memory-only field, matching the C# source's comment -- it's
 * populated by `PendingReleaseService.IncludeRemoteBooks` on read, never
 * written to the `PendingReleases` table.
 *
 * KNOWN QUIRK, preserved faithfully (not fixed -- see this port's top-level
 * task instructions: "known bugs get fixed later, separately"):
 * `additionalInfo` has no backing column either, but unlike `remoteBook`
 * it's NOT registered with `.Ignore()` in the real C#
 * `TableMapping.cs` (`Mapper.Entity<PendingRelease>("PendingReleases")
 * .RegisterModel().Ignore(e => e.RemoteBook)` -- only RemoteBook is
 * ignored). Since the underlying `PendingReleases` table genuinely has no
 * `AdditionalInfo` column, this field is silently dropped on every real
 * insert/update -- `PendingReleaseService.Insert()` sets it, but it never
 * round-trips through the DB, so `additionalInfo.releaseSource` is always
 * `Unknown` (the default) after a repository round-trip. Ported here with
 * the same effective behavior: the repository (see
 * `pendingReleaseRepository.ts`) does not persist or read back this field.
 */
export interface PendingRelease extends ModelBase {
  authorId: number;
  title: string;
  /** ISO 8601 string. */
  added: string;
  parsedBookInfo: ParsedBookInfo;
  release: ReleaseInfo;
  reason: PendingReleaseReason;
  additionalInfo: PendingReleaseAdditionalInfo | null;

  /** Not persisted -- see doc comment above. */
  remoteBook: RemoteBook | null;
}
