import { releaseInfoToStringFormat, type ReleaseInfo } from "./releaseInfo.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/TorrentInfo.cs.
 *
 * C# used class inheritance (`TorrentInfo : ReleaseInfo`); ported here as
 * composition (`release: ReleaseInfo` plus the torrent-specific fields)
 * since that's this codebase's established pattern for "subclass adds
 * fields" C# shapes when there's no shared runtime dispatch needed --
 * `GetSeeders`/`GetPeers`'s C# `as TorrentInfo` downcast becomes a plain
 * discriminated check on `torrentInfo` being present.
 */
export interface TorrentInfo {
  release: ReleaseInfo;
  magnetUrl: string | null;
  infoHash: string | null;
  seeders: number | null;
  peers: number | null;
}

export function newTorrentInfo(release: ReleaseInfo): TorrentInfo {
  return {
    release,
    magnetUrl: null,
    infoHash: null,
    seeders: null,
    peers: null,
  };
}

/**
 * Ported from `TorrentInfo.GetSeeders(ReleaseInfo release)`: the C# `as
 * TorrentInfo` downcast becomes an explicit `torrentInfo: TorrentInfo |
 * undefined` parameter at call sites (TS has no runtime type test for
 * "is this ReleaseInfo actually a TorrentInfo" the way C#'s `as` does with
 * real inheritance) -- callers that hold a `TorrentInfo` pass it directly;
 * callers that only have a bare `ReleaseInfo` pass `undefined`.
 */
export function getSeeders(torrentInfo: TorrentInfo | undefined): number | null {
  return torrentInfo ? torrentInfo.seeders : null;
}

/** Ported from `TorrentInfo.GetPeers(ReleaseInfo release)`. See `getSeeders`'s doc comment for the `as TorrentInfo` downcast note. */
export function getPeers(torrentInfo: TorrentInfo | undefined): number | null {
  return torrentInfo ? torrentInfo.peers : null;
}

/** Ported from `TorrentInfo.ToString(string format)`: base ReleaseInfo lines plus MagnetUrl/InfoHash/Seeders/Peers for "L" (long) format. */
export function torrentInfoToStringFormat(torrentInfo: TorrentInfo, format: string): string {
  const base = releaseInfoToStringFormat(torrentInfo.release, format);

  if (format.toUpperCase() === "L") {
    const lines = [
      `MagnetUrl: ${torrentInfo.magnetUrl ?? "Empty"}`,
      `InfoHash: ${torrentInfo.infoHash ?? "Empty"}`,
      `Seeders: ${torrentInfo.seeders ?? "Empty"}`,
      `Peers: ${torrentInfo.peers ?? "Empty"}`,
    ];
    return base + lines.join("\n") + "\n";
  }

  return base;
}
