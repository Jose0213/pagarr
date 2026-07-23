/**
 * Ported from NzbDrone.Core/Notifications/Slack/Payloads/*.cs (Attachment,
 * SlackPayload). Field names use the C# `[JsonProperty]`-annotated wire
 * names directly (`icon_emoji`, `icon_url`), matching this module's
 * `discord/payloads.ts` precedent.
 */
export interface Attachment {
  fallback?: string;
  title?: string;
  text?: string;
  color?: string;
}

export interface SlackPayload {
  text?: string | null;
  username?: string | null;
  icon_emoji?: string;
  icon_url?: string;
  channel?: string;
  attachments?: Attachment[];
}
