/**
 * Ported from NzbDrone.Core/Notifications/Slack/SlackExeption.cs.
 *
 * PRESERVED C# QUIRK: the real class is misspelled `SlackExeption` (not
 * `SlackException`) in the actual Readarr source. Preserved verbatim here
 * (including the misspelling) per this port's "don't fix, preserve
 * faithfully" rule -- do not rename to "SlackException" at merge time
 * without an explicit, separately-tracked cleanup decision.
 */
export class SlackExeption extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SlackExeption";
    Object.setPrototypeOf(this, SlackExeption.prototype);
  }
}
