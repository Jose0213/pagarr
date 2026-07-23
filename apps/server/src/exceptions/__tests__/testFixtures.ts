import { newReleaseInfo, type ReleaseInfo } from "../../parser/model/releaseInfo.js";

/** Minimal `ReleaseInfo` fixture for exercising the `ReleaseDownloadException` family's `release` property. */
export function makeReleaseInfo(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    ...newReleaseInfo(),
    guid: "guid-1",
    title: "Some.Author.Some.Book.MP3",
    indexer: "TestIndexer",
    author: "Some Author",
    book: "Some Book",
    ...overrides,
  };
}
