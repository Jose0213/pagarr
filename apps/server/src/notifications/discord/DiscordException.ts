/**
 * Ported from NzbDrone.Core/Notifications/Discord/DiscordException.cs
 * (`NzbDroneException`). `NzbDrone.Common.Exceptions.NzbDroneException` is
 * not ported in this worktree's scope; narrowed to a plain `Error` subclass
 * matching the sibling exceptions already ported elsewhere in this repo
 * (e.g. `exceptions/AuthorNotFoundException.ts`).
 */
export class DiscordException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DiscordException";
    Object.setPrototypeOf(this, DiscordException.prototype);
  }
}
