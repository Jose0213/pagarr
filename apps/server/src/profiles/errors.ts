/**
 * Ported from NzbDrone.Core/Profiles/Qualities/QualityProfileInUseException.cs
 * and NzbDrone.Core/Profiles/Metadata/MetadataProfileInUseException.cs.
 *
 * Both extended `NzbDroneClientException` (HTTP-status-carrying exception
 * base from NzbDrone.Core/Exceptions/, not yet ported) with a fixed
 * HttpStatusCode.BadRequest and a "Profile [{0}] is in use."-shaped message.
 * The base isn't ported yet, so `statusCode` is kept as a plain field on
 * these Error subclasses -- callers that need to translate this into an HTTP
 * response (a not-yet-ported API layer) can read `.statusCode` the same way
 * the C# API layer read `NzbDroneClientException.StatusCode`.
 */
export class QualityProfileInUseException extends Error {
  readonly statusCode = 400;

  constructor(name: string) {
    super(`Profile [${name}] is in use.`);
    this.name = "QualityProfileInUseException";
  }
}

export class MetadataProfileInUseException extends Error {
  readonly statusCode = 400;

  constructor(name: string) {
    super(`Metadata profile [${name}] is in use.`);
    this.name = "MetadataProfileInUseException";
  }
}
