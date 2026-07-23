/**
 * Ported from NzbDrone.Core/Notifications/Subsonic/SubsonicException.cs +
 * SubsonicAuthenticationException.cs (`: SubsonicException`).
 *
 * Same `{ args, cause }` options convention as
 * `download-clients/DownloadClientException.ts` / `notifications/plex/PlexException.ts`.
 */
export interface SubsonicExceptionOptions {
  args?: unknown[];
  cause?: unknown;
}

export class SubsonicException extends Error {
  constructor(message: string, options: SubsonicExceptionOptions = {}) {
    const { args = [], cause } = options;
    super(args.length > 0 ? formatMessage(message, args) : message, { cause });
    this.name = "SubsonicException";
    Object.setPrototypeOf(this, SubsonicException.prototype);
  }
}

export class SubsonicAuthenticationException extends SubsonicException {
  constructor(message: string, options: SubsonicExceptionOptions = {}) {
    super(message, options);
    this.name = "SubsonicAuthenticationException";
    Object.setPrototypeOf(this, SubsonicAuthenticationException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}
