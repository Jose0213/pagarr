import type { ReleaseInfo } from "../indexers/releaseInfo.js";

export { isTorrentInfo, type ReleaseInfo, type TorrentInfo } from "../indexers/releaseInfo.js";

/**
 * Forward-ref for NzbDrone.Core/Parser/Model/RemoteBook.cs's
 * `ReleaseSourceType` enum -- used by `TorrentClientBase.EnsureReleaseIsNotBlocklisted`
 * to skip the blocklist-hash check for interactive-search grabs.
 */
export const ReleaseSourceType = {
  Unknown: 0,
  Rss: 1,
  Search: 2,
  UserInvokedSearch: 3,
  InteractiveSearch: 4,
  ReleasePush: 5,
} as const;
export type ReleaseSourceType = (typeof ReleaseSourceType)[keyof typeof ReleaseSourceType];

/**
 * Forward-ref for the minimal slice of NzbDrone.Core/Parser/Model/RemoteBook.cs
 * that this module's `TorrentClientBase`/`UsenetClientBase`/QBittorrent/
 * Sabnzbd/Blackhole clients actually read: `Release` (the real, merged
 * `ReleaseInfo` from `indexers/releaseInfo.ts` -- NOT a second local
 * forward-ref copy, matching the "reuse the real owning module's type"
 * precedent `DownloadClientDefinition.ts` follows for `IProviderConfig`),
 * `SeedConfiguration` (this module's own `TorrentSeedConfiguration`, which
 * *is* actually declared under `Download/Clients/` in the real C# source --
 * in scope), `ReleaseSource`, and `Author.Id` (only `.Id` is ever read, by
 * `EnsureReleaseIsNotBlocklisted`/`BlocklistSpecification`-style checks).
 *
 * The full real `RemoteBook` (with `ParsedBookInfo`, `Books`,
 * `CustomFormats`, etc. -- see `decision-engine/remoteBook.ts`'s own
 * forward-ref copy, which is a DIFFERENT, unrelated forward-ref living in
 * the DecisionEngine module) belongs to the not-yet-fully-reconciled
 * `Parser` module. `IsRecentBook()` (`RemoteBook.IsRecentBook()`, checked by
 * QBittorrent/Sabnzbd for recent-vs-older priority selection) is ported here
 * as a plain function over this narrowed shape's `books` array, mirroring
 * `decision-engine/remoteBook.ts`'s own `isRecentBook()` port 1:1 (same
 * 14-day-cutoff logic) since this module doesn't depend on that module.
 */
export interface RemoteBookLike {
  release: ReleaseInfo;
  seedConfiguration: TorrentSeedConfigurationLike | null;
  releaseSource: ReleaseSourceType;
  author: { id: number };
  /** Only `releaseDate` is read (by `isRecentBook`). */
  books: { releaseDate?: string | null }[];
}

/** Forward-ref alias so this file doesn't need a direct import cycle with TorrentSeedConfiguration.ts for the type-only use above. */
export type TorrentSeedConfigurationLike =
  import("./TorrentSeedConfiguration.js").TorrentSeedConfiguration;

/** Ported from `RemoteBook.IsRecentBook()`: true if any book in the release was published within the last 14 days. */
export function isRecentBook(remoteBook: RemoteBookLike): boolean {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return remoteBook.books.some(
    (b) => b.releaseDate != null && new Date(b.releaseDate).getTime() >= cutoff
  );
}
