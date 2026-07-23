/**
 * Ported from NzbDrone.Core/Notifications/Pushover/PushoverPriority.cs.
 * `as const` object + derived union type (not a TS `enum`) -- matches this
 * port's established convention for a C# enum whose values are stored in
 * a plain `number` settings field and directly `===`-compared against it
 * (see e.g. download-clients/qbittorrent/QBittorrentPriority.ts), which a
 * real TS `enum` triggers `@typescript-eslint/no-unsafe-enum-comparison`
 * for.
 */
export const PushoverPriority = {
  Silent: -2,
  Quiet: -1,
  Normal: 0,
  High: 1,
  Emergency: 2,
} as const;
export type PushoverPriority = (typeof PushoverPriority)[keyof typeof PushoverPriority];
