import type { ReleaseInfo } from "../parser/model/releaseInfo.js";

/**
 * Ported from NzbDrone.Core/Exceptions/ReleaseDownloadException.cs.
 *
 * Base class for the release-download failure family (`ReleaseUnavailableException`,
 * `ReleaseBlockedException`, `DownloadClientRejectedReleaseException`).
 * Carries the `ReleaseInfo` (NzbDrone.Core/Parser/Model/ReleaseInfo.cs,
 * already ported at `parser/model/releaseInfo.ts`) the failure happened for.
 *
 * `download-tracking/downloadClients.ts`'s forward-ref stub for this family
 * did NOT include a base `ReleaseDownloadException` with a `release`
 * property -- it only forward-ref'd the three subclasses as bare
 * `extends Error {}`, plus its own guess at `ReleaseDownloadException` with
 * an `innerException` property instead of `release`. The real C# shape is
 * the reverse: `release: ReleaseInfo` is the one property every class in
 * this family actually carries (set via the constructor and used by callers
 * like `DownloadService`/`ProcessDownloadDecisions` to know which release
 * failed); the "inner exception" the forward-ref guessed at instead maps to
 * this port's second constructor parameter `cause` (standard `Error`
 * cause-chaining, matching `Exception innerException` in the two 3-arg C#
 * overloads) -- NOT a bespoke `innerException` field. See this file's
 * sibling classes' doc comments for the full mismatch list.
 */
export class ReleaseDownloadException extends Error {
  readonly release: ReleaseInfo;

  constructor(release: ReleaseInfo, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReleaseDownloadException";
    this.release = release;
    Object.setPrototypeOf(this, ReleaseDownloadException.prototype);
  }
}
