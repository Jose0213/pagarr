import type { ReleaseInfo } from "../parser/model/releaseInfo.js";
import { ReleaseDownloadException } from "./ReleaseDownloadException.js";

/**
 * Ported from NzbDrone.Core/Exceptions/ReleaseBlockedException.cs.
 *
 * Pure marker subclass in the real C# -- adds no members beyond
 * `ReleaseDownloadException`'s `Release`, just forwards all constructor
 * overloads. Thrown when a release is blocked (e.g. matches a blocklist
 * entry) and should not be downloaded.
 *
 * `download-tracking/downloadClients.ts`'s forward-ref had this as a bare
 * `class ReleaseBlockedException extends Error {}` -- see
 * ReleaseDownloadException.ts's doc comment for the full mismatch list
 * against the forward-ref.
 */
export class ReleaseBlockedException extends ReleaseDownloadException {
  constructor(release: ReleaseInfo, message: string, options?: { cause?: unknown }) {
    super(release, message, options);
    this.name = "ReleaseBlockedException";
    Object.setPrototypeOf(this, ReleaseBlockedException.prototype);
  }
}
