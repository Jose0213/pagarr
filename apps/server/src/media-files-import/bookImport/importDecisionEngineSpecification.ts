import type { Decision } from "../../decision-engine/decision.js";

/**
 * Forward-reference for `NzbDrone.Core.Download.DownloadClientItem`
 * (module `Download`, ported in the parallel `download-tracking`/
 * `download-clients` sibling worktree -- not merged into this worktree
 * yet). Narrowed to the exact fields this module's specifications and
 * services actually read off it: `DownloadId`/`Title`/`CanMoveFiles` (see
 * e.g. `ImportApprovedBooks`'s `GetSceneReleaseName`,
 * `ImportDecisionMaker`'s `downloadClientItem.CanMoveFiles`,
 * `AlreadyImportedSpecification`'s `downloadClientItem.DownloadId`).
 * Field names/shape copied 1:1 from the real
 * NzbDrone.Core/Download/DownloadClientItem.cs so the swap to the real
 * type is mechanical once that worktree merges.
 */
export interface DownloadClientItemLike {
  downloadId: string | null;
  title: string;
  canMoveFiles: boolean;
}

/** Ported from NzbDrone.Core/MediaFiles/BookImport/IImportDecisionEngineSpecification.cs. */
export interface IImportDecisionEngineSpecification<T> {
  isSatisfiedBy(item: T, downloadClientItem: DownloadClientItemLike | null): Decision;
}
