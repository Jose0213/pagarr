import { ApiException } from "../exceptions/ApiException.js";

/**
 * Ported from Readarr.Http/REST/BadRequestException.cs. Fixed at HTTP 400.
 *
 * NOTE on naming collision: this is a distinct class from
 * `apps/server/src/exceptions/BadRequestException.ts`
 * (`NzbDrone.Core.Exceptions.BadRequestException`, a `DownstreamException`
 * subclass already ported in Phase 4 Wave 1). That one represents a
 * downstream service rejecting a request Pagarr sent it; this one
 * (`Readarr.Http.REST.BadRequestException`) represents a REST controller
 * itself rejecting an inbound HTTP request (bad id, empty body, etc.) --
 * see rest/RestController.ts's `validateId`/`validateResource`. Both are
 * real, distinct C# classes with the same name in different namespaces;
 * this port preserves that distinction via directory location
 * (`http-api/rest/` vs `exceptions/`) rather than renaming either.
 */
export class BadRequestException extends ApiException {
  constructor(content?: unknown) {
    super(400, content);
    this.name = "BadRequestException";
    Object.setPrototypeOf(this, BadRequestException.prototype);
  }
}
