/**
 * Ported from NzbDrone.Core/Parser/Model/ImportListItemInfo.cs.
 */
export interface ImportListItemInfo {
  importListId: number;
  importList: string | null;
  author: string | null;
  authorGoodreadsId: string | null;
  book: string | null;
  bookGoodreadsId: string | null;
  editionGoodreadsId: string | null;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  releaseDate: string;
}

export function newImportListItemInfo(): ImportListItemInfo {
  return {
    importListId: 0,
    importList: null,
    author: null,
    authorGoodreadsId: null,
    book: null,
    bookGoodreadsId: null,
    editionGoodreadsId: null,
    releaseDate: new Date(0).toISOString(),
  };
}

/** Ported from `ImportListItemInfo.ToString()`: "[{ReleaseDate}] {Author} [{Book}]". */
export function importListItemInfoToString(info: ImportListItemInfo): string {
  return `[${info.releaseDate}] ${info.author} [${info.book}]`;
}
