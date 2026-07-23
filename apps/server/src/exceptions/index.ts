/**
 * Barrel export for the Exceptions module -- port of
 * NzbDrone.Core/Exceptions/*.cs.
 *
 * `NzbDroneException` (NzbDrone.Common/Exceptions/NzbDroneException.cs), the
 * real base class every exception here derives from, is NOT ported as its
 * own class -- see NzbDroneClientException.ts's doc comment for why (it's a
 * do-nothing `string.Format` shim; every class here extends `Error` or each
 * other directly instead).
 *
 * This module is a direct reconciliation target for
 * `download-tracking/downloadClients.ts`'s forward-ref stand-ins for
 * `ReleaseUnavailableException`, `ReleaseBlockedException`,
 * `DownloadClientRejectedReleaseException`, and `ReleaseDownloadException`
 * -- see this module's other files' doc comments for the specific shape
 * mismatches against those forward-refs. That reconciliation (swapping the
 * forward-ref for these real exports) is a separate change, not made here.
 */

export { NzbDroneClientException } from "./NzbDroneClientException.js";
export { DownstreamException } from "./DownstreamException.js";
export { BadRequestException } from "./BadRequestException.js";

export { AuthorNotFoundException } from "./AuthorNotFoundException.js";
export { BookNotFoundException } from "./BookNotFoundException.js";
export { EditionNotFoundException } from "./EditionNotFoundException.js";

export { ReleaseDownloadException } from "./ReleaseDownloadException.js";
export { ReleaseUnavailableException } from "./ReleaseUnavailableException.js";
export { ReleaseBlockedException } from "./ReleaseBlockedException.js";
export { DownloadClientRejectedReleaseException } from "./DownloadClientRejectedReleaseException.js";

export { verifyStatusCode } from "./StatusCodeToExceptions.js";
