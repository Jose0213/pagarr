/**
 * Ported from NzbDrone.Core/Notifications/Discord/Payloads/*.cs (DiscordAuthor,
 * DiscordField, DiscordImage, DiscordPayload, Embed). Field names use the C#
 * `[JsonProperty]`-annotated wire names directly (`icon_url`, `avatar_url`)
 * since these are serialized straight to the Discord webhook API as JSON,
 * matching how `download-clients/qbittorrent`'s wire-shape types spell
 * their JSON field names verbatim rather than camelCasing + a serializer
 * mapping layer.
 */
export interface DiscordAuthor {
  name?: string;
  icon_url?: string;
}

export interface DiscordField {
  name?: string;
  value?: string;
  inline?: boolean;
}

export interface DiscordImage {
  url?: string;
}

export interface Embed {
  description?: string;
  title?: string;
  text?: string;
  color?: number;
  url?: string;
  author?: DiscordAuthor;
  thumbnail?: DiscordImage;
  image?: DiscordImage;
  timestamp?: string;
  fields?: DiscordField[];
}

export interface DiscordPayload {
  content?: string | null;
  username?: string | null;
  avatar_url?: string;
  embeds?: Embed[];
}
