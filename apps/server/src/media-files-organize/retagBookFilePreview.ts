/** Ported from NzbDrone.Core/MediaFiles/RetagBookFilePreview.cs. C#'s `Tuple<string, string>` (old value, new value) is ported as a 2-tuple type. */
export interface RetagBookFilePreview {
  authorId: number;
  bookId: number;
  trackNumbers: number[];
  bookFileId: number;
  path: string;
  changes: Record<string, [string, string]>;
}

export function newRetagBookFilePreview(): RetagBookFilePreview {
  return {
    authorId: 0,
    bookId: 0,
    trackNumbers: [],
    bookFileId: 0,
    path: "",
    changes: {},
  };
}
