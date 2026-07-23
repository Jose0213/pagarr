import type { Author, Book } from "../../books/models.js";
import { newAuthor, newBook, NewItemMonitorTypes } from "../../books/models.js";
import {
  newQualityItem,
  type QualityProfileQualityItem,
} from "../../profiles/qualities/qualityProfileQualityItem.js";
import { newQualityProfile, type QualityProfile } from "../../profiles/qualities/qualityProfile.js";
import { Quality, type Quality as QualityType } from "../../qualities/quality.js";
import { newQualityModel, type QualityModel } from "../../qualities/qualityModel.js";
import { Revision } from "../../qualities/revision.js";
import type {
  AuthorWithQualityProfile,
  ParsedBookInfo,
  ReleaseInfo,
  RemoteBook,
} from "../remoteBook.js";
import { DownloadProtocol, ReleaseSourceType } from "../remoteBook.js";

/**
 * Shared test fixture builders for the DecisionEngine test suite, mirroring
 * NzbDrone.Core.Test/Qualities/QualityFixture.cs's `GetDefaultQualities` and
 * the various fixtures' `CoreTest`-provided default objects (Builder<Author>
 * .Generate() etc). Kept minimal and local to this test suite rather than
 * shared with other modules' tests.
 */

/** Ported from NzbDrone.Core.Test/Qualities/QualityFixture.cs's `GetDefaultQualities(params Quality[] allowed)`. */
export function getDefaultQualities(...allowed: QualityType[]): QualityProfileQualityItem[] {
  const qualities: QualityType[] = [
    Quality.Unknown,
    Quality.MOBI,
    Quality.EPUB,
    Quality.AZW3,
    Quality.MP3,
    Quality.FLAC,
  ];

  const allowedList = allowed.length === 0 ? qualities : allowed;
  const allowedIds = new Set(allowedList.map((q) => q.id));

  const ordered = [...qualities.filter((q) => !allowedIds.has(q.id)), ...allowedList];

  return ordered.map((q) => newQualityItem({ quality: q, allowed: allowedIds.has(q.id) }));
}

export function makeQualityProfile(overrides: Partial<QualityProfile> = {}): QualityProfile {
  return newQualityProfile({
    id: 1,
    name: "Test Profile",
    upgradeAllowed: true,
    items: getDefaultQualities(),
    ...overrides,
  });
}

export function makeAuthor(
  overrides: Partial<Author> = {},
  qualityProfile?: QualityProfile
): AuthorWithQualityProfile {
  const author = {
    ...newAuthor(),
    id: 1,
    monitored: true,
    monitorNewItems: NewItemMonitorTypes.All,
    ...overrides,
  };

  return {
    ...author,
    qualityProfile: qualityProfile ?? makeQualityProfile(),
  };
}

export function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    ...newBook(),
    id: 1,
    title: "Test Book",
    monitored: true,
    ...overrides,
  };
}

export function makeQuality(
  quality: QualityType = Quality.MP3,
  revision?: Partial<{ version: number; real: number; isRepack: boolean }>
): QualityModel {
  return newQualityModel(quality, revision ? new Revision(revision) : undefined);
}

export function makeReleaseInfo(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    guid: "guid-1",
    title: "Some.Author.Some.Book.MP3",
    size: 100 * 1024 * 1024,
    downloadUrl: "http://example.com/download",
    indexerId: 1,
    indexer: "TestIndexer",
    indexerPriority: 25,
    downloadProtocol: DownloadProtocol.Usenet,
    publishDate: new Date().toISOString(),
    categories: [],
    ...overrides,
  };
}

export function makeParsedBookInfo(overrides: Partial<ParsedBookInfo> = {}): ParsedBookInfo {
  return {
    authorName: "Some Author",
    quality: makeQuality(),
    discography: false,
    ...overrides,
  };
}

export function makeRemoteBook(overrides: Partial<RemoteBook> = {}): RemoteBook {
  const author = overrides.author ?? makeAuthor();
  return {
    release: makeReleaseInfo(),
    parsedBookInfo: makeParsedBookInfo(),
    author,
    books: [makeBook()],
    downloadAllowed: true,
    customFormats: [],
    customFormatScore: 0,
    releaseSource: ReleaseSourceType.Unknown,
    ...overrides,
  };
}
