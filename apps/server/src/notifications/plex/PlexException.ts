/**
 * Ported from NzbDrone.Core/Notifications/Plex/PlexException.cs +
 * PlexAuthenticationException.cs (`: PlexException`) +
 * PlexVersionException.cs (`: NzbDroneException` directly, NOT
 * `PlexException` -- preserved faithfully below, it does NOT extend
 * `PlexException` despite living in the same directory and looking related).
 *
 * `NzbDroneException` isn't ported as its own class -- see
 * `exceptions/NzbDroneClientException.ts`'s doc comment and
 * `download-clients/DownloadClientException.ts`'s `{ args, cause }` options
 * convention, reused here.
 */
export interface PlexExceptionOptions {
  args?: unknown[];
  cause?: unknown;
}

export class PlexException extends Error {
  constructor(message: string, options: PlexExceptionOptions = {}) {
    const { args = [], cause } = options;
    super(args.length > 0 ? formatMessage(message, args) : message, { cause });
    this.name = "PlexException";
    Object.setPrototypeOf(this, PlexException.prototype);
  }
}

export class PlexAuthenticationException extends PlexException {
  constructor(message: string, options: PlexExceptionOptions = {}) {
    super(message, options);
    this.name = "PlexAuthenticationException";
    Object.setPrototypeOf(this, PlexAuthenticationException.prototype);
  }
}

/** Ported from PlexVersionException.cs -- extends Error directly, NOT PlexException, matching the C# source's `: NzbDroneException`. */
export class PlexVersionException extends Error {
  constructor(message: string, options: PlexExceptionOptions = {}) {
    const { args = [], cause } = options;
    super(args.length > 0 ? formatMessage(message, args) : message, { cause });
    this.name = "PlexVersionException";
    Object.setPrototypeOf(this, PlexVersionException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}
