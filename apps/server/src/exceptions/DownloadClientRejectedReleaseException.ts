import type { ReleaseInfo } from "../parser/model/releaseInfo.js";
import { ReleaseDownloadException } from "./ReleaseDownloadException.js";

/**
 * Ported from NzbDrone.Core/Exceptions/DownloadClientRejectedReleaseException.cs.
 *
 * Pure marker subclass in the real C# -- adds no members beyond
 * `ReleaseDownloadException`'s `Release`, just forwards all constructor
 * overloads. Thrown when the download client itself rejects a release (e.g.
 * a torrent client refuses a magnet/torrent it was handed).
 *
 * `download-tracking/downloadClients.ts`'s forward-ref had this as a bare
 * `class DownloadClientRejectedReleaseException extends Error {}` -- see
 * ReleaseDownloadException.ts's doc comment for the full mismatch list
 * against the forward-ref.
 */
export class DownloadClientRejectedReleaseException extends ReleaseDownloadException {
  constructor(release: ReleaseInfo, message: string, options?: { cause?: unknown }) {
    super(release, message, options);
    this.name = "DownloadClientRejectedReleaseException";
    Object.setPrototypeOf(this, DownloadClientRejectedReleaseException.prototype);
  }
}
