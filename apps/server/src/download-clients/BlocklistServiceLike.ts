/**
 * Forward-ref for the slice of NzbDrone.Core/Blocklisting/IBlocklistService.cs
 * that `TorrentClientBase.EnsureReleaseIsNotBlocklisted` calls:
 * `BlocklistedTorrentHash(authorId, hash)`. Same not-yet-ported-module
 * situation as `decision-engine/specifications/blocklistSpecification.ts`'s
 * own `BlocklistServiceLike` (Blocklisting is Phase 4) -- this is a
 * DIFFERENT single-method slice of the same C# interface (that spec calls
 * `Blocklisted(authorId, release)`; TorrentClientBase calls
 * `BlocklistedTorrentHash(authorId, hash)`), so it's declared separately
 * here rather than importing across worktree/module boundaries.
 */
export interface BlocklistServiceLike {
  blocklistedTorrentHash(authorId: number, hash: string): boolean;
}

export const noopBlocklistService: BlocklistServiceLike = {
  blocklistedTorrentHash: () => false,
};
