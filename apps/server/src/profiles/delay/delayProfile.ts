import type { ModelBase } from "../../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Profiles/Delay/DelayProfile.cs.
 *
 * `PreferredProtocol` is `DownloadProtocol` in C# (Indexers module enum,
 * not yet ported -- Indexers is Phase 2, this module is Phase 1). Kept as
 * the same two-value shape Indexers will define (Unknown=0, Usenet=1,
 * Torrent=2 per NzbDrone.Core.Indexers.DownloadProtocol) so this doesn't
 * need to change when that module lands; see downloadProtocol.ts.
 */
export interface DelayProfile extends ModelBase {
  enableUsenet: boolean;
  enableTorrent: boolean;
  preferredProtocol: DownloadProtocol;
  usenetDelay: number;
  torrentDelay: number;
  order: number;
  bypassIfHighestQuality: boolean;
  bypassIfAboveCustomFormatScore: boolean;
  minimumCustomFormatScore: number | null;
  tags: Set<number>;
}

/**
 * Local stand-in for NzbDrone.Core/Indexers/DownloadProtocol.cs, the only
 * part of the not-yet-ported Indexers module DelayProfile references. See
 * this file's top doc comment.
 */
export enum DownloadProtocol {
  Unknown = 0,
  Usenet = 1,
  Torrent = 2,
}

export function newDelayProfile(overrides: Partial<DelayProfile> = {}): DelayProfile {
  return {
    id: 0,
    enableUsenet: false,
    enableTorrent: false,
    preferredProtocol: DownloadProtocol.Unknown,
    usenetDelay: 0,
    torrentDelay: 0,
    order: 0,
    bypassIfHighestQuality: false,
    bypassIfAboveCustomFormatScore: false,
    minimumCustomFormatScore: null,
    tags: new Set<number>(),
    ...overrides,
  };
}

/** Ported from DelayProfile.GetProtocolDelay(DownloadProtocol protocol). */
export function getProtocolDelay(profile: DelayProfile, protocol: DownloadProtocol): number {
  return protocol === DownloadProtocol.Torrent ? profile.torrentDelay : profile.usenetDelay;
}
