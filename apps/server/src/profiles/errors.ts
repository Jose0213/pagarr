/**
 * Ported from NzbDrone.Core/Profiles/Qualities/QualityProfileInUseException.cs
 * and NzbDrone.Core/Profiles/Metadata/MetadataProfileInUseException.cs.
 *
 * Both extend `NzbDroneClientException` (HTTP-status-carrying exception base
 * from NzbDrone.Core/Exceptions/) with a fixed HttpStatusCode.BadRequest and
 * a "Profile [{0}] is in use."-shaped message.
 *
 * UPDATED (Phase 5, http-api/resources/profiles wave): `exceptions/
 * NzbDroneClientException.ts` has since landed (Phase 4 Wave 1, after this
 * file was first ported) -- these two now extend it directly, matching the
 * real C# inheritance exactly, instead of the plain-`Error`-with-a-bolted-on
 * `statusCode` field this module used as a stand-in before that base
 * existed. This is required for `http-api/error-management/
 * ReadarrErrorPipeline.ts`'s `instanceof NzbDroneClientException` branch to
 * correctly map a thrown MetadataProfileInUseException/
 * QualityProfileInUseException to HTTP 400 -- without this, the pipeline's
 * generic catch-all would 500 instead, breaking DeleteProfile's real
 * behavior for both MetadataProfileController and QualityProfileController.
 */
import { NzbDroneClientException } from "../exceptions/NzbDroneClientException.js";

export class QualityProfileInUseException extends NzbDroneClientException {
  constructor(name: string) {
    super(400, `Profile [${name}] is in use.`);
    this.name = "QualityProfileInUseException";
    Object.setPrototypeOf(this, QualityProfileInUseException.prototype);
  }
}

export class MetadataProfileInUseException extends NzbDroneClientException {
  constructor(name: string) {
    super(400, `Metadata profile [${name}] is in use.`);
    this.name = "MetadataProfileInUseException";
    Object.setPrototypeOf(this, MetadataProfileInUseException.prototype);
  }
}
