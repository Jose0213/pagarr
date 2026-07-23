import type { ReleaseInfo } from "../parser/model/releaseInfo.js";
import { ReleaseDownloadException } from "./ReleaseDownloadException.js";

/**
 * Ported from NzbDrone.Core/Exceptions/ReleaseUnavailableException.cs.
 *
 * Pure marker subclass in the real C# -- adds no members beyond
 * `ReleaseDownloadException`'s `Release`, just forwards all constructor
 * overloads. Thrown when a release's download link/NZB/torrent is no longer
 * available at the indexer.
 *
 * `download-tracking/downloadClients.ts`'s forward-ref had this as a bare
 * `class ReleaseUnavailableException extends Error {}` with no `release`
 * property and no relation to a `ReleaseDownloadException` base -- the real
 * shape below adds both (see ReleaseDownloadException.ts's doc comment for
 * the full mismatch list against the forward-ref).
 */
export class ReleaseUnavailableException extends ReleaseDownloadException {
  constructor(release: ReleaseInfo, message: string, options?: { cause?: unknown }) {
    super(release, message, options);
    this.name = "ReleaseUnavailableException";
    Object.setPrototypeOf(this, ReleaseUnavailableException.prototype);
  }
}
