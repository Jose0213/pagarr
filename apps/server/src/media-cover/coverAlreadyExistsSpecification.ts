/**
 * Ported from NzbDrone.Core/MediaCover/CoverAlreadyExistsSpecification.cs.
 *
 * Narrowed `IDiskProvider` forward-reference (`FileExists`, `GetFileSize`,
 * `FileGetLastWrite` -- the three methods this specification calls), same
 * "each module narrows the ~40-method C# IDiskProvider to just what it
 * needs" pattern already established by `download-clients/
 * ICoverExistsDiskProviderLike.ts`, `root-folders/disk-provider.ts`, and
 * `decision-engine/specifications/rssSync/deletedBookFileSpecification.ts`'s
 * own `CoverExistsDiskProviderLike` (see `download-clients/ICoverExistsDiskProviderLike.ts`'s
 * doc comment for the fuller rationale -- a future full `Common/Disk`
 * module unifies all of these). `fileGetLastWrite` returns milliseconds
 * since epoch (matching `ICoverExistsDiskProviderLike.ts`'s convention for
 * `DateTime`-returning disk methods), so comparisons here are done as
 * epoch-millisecond equality rather than .NET `DateTime.ToUniversalTime()`
 * equality -- see `alreadyExists`'s doc comment for why that's still a
 * faithful port.
 */

export interface CoverExistsDiskProviderLike {
  fileExists(path: string): boolean;
  getFileSize(path: string): number;
  /** Milliseconds since epoch. Ported from `IDiskProvider.FileGetLastWrite(string path)`, which returns a local-time `DateTime`. */
  fileGetLastWrite(path: string): number;
}

export interface ICoverExistsSpecification {
  alreadyExists(
    serverModifiedDate: Date | null,
    serverContentLength: number | null,
    localPath: string
  ): boolean;
}

/**
 * Ported from NzbDrone.Core/MediaCover/CoverAlreadyExistsSpecification.cs.
 *
 * C#'s `AlreadyExists` compares `lastModifiedLocal.Value.ToUniversalTime()
 * == serverModifiedDate.Value.ToUniversalTime()` -- both sides converted to
 * UTC before comparing, so the comparison is timezone-independent (it's
 * really just "same instant in time"). Since this port's `fileGetLastWrite`
 * returns epoch milliseconds (an already-timezone-independent
 * representation -- see `CoverExistsDiskProviderLike` doc comment above) and `Date`
 * objects are likewise absolute instants, comparing `.getTime()` values
 * directly is equivalent to the C# double-ToUniversalTime() comparison
 * without needing to model timezone conversion at all.
 */
export class CoverAlreadyExistsSpecification implements ICoverExistsSpecification {
  constructor(private readonly diskProvider: CoverExistsDiskProviderLike) {}

  alreadyExists(
    serverModifiedDate: Date | null,
    serverContentLength: number | null,
    localPath: string
  ): boolean {
    if (!this.diskProvider.fileExists(localPath)) {
      return false;
    }

    if (serverContentLength !== null && serverContentLength > 0) {
      const fileSize = this.diskProvider.getFileSize(localPath);

      return fileSize === serverContentLength;
    }

    if (serverModifiedDate !== null) {
      const lastModifiedLocal = this.diskProvider.fileGetLastWrite(localPath);

      return lastModifiedLocal === serverModifiedDate.getTime();
    }

    return false;
  }
}
