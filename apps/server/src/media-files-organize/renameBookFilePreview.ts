/** Ported from NzbDrone.Core/MediaFiles/RenameBookFilePreview.cs. */
export interface RenameBookFilePreview {
  authorId: number;
  bookId: number;
  trackNumbers?: number[];
  bookFileId: number;
  existingPath: string;
  newPath: string;
}
