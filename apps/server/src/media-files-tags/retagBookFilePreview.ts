/**
 * Ported from NzbDrone.Core/MediaFiles/RetagBookFilePreview.cs. Plain data
 * bag -- the `Dictionary<string, Tuple<string, string>>` `Changes` field
 * maps onto this module's `AudioTagDiff`/CalibreBook-diff shape
 * (`Record<string, [string | null, string | null]>`, see audioTag.ts's
 * `AudioTagDiff`).
 */
export interface RetagBookFilePreview {
  authorId: number;
  bookId: number;
  /** C# `List<int> TrackNumbers = new List<int>()` -- unused by any ported constructor call site (never set), kept for shape fidelity. */
  trackNumbers: number[];
  bookFileId: number;
  path: string;
  changes: Record<string, [string | null, string | null]>;
}

/** Ported from the `RetagBookFilePreview()` field initializer: `TrackNumbers` defaults to an empty list. */
export function newRetagBookFilePreview(
  fields: Omit<RetagBookFilePreview, "trackNumbers">
): RetagBookFilePreview {
  return { ...fields, trackNumbers: [] };
}
