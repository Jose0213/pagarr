import {
  AuthorStatusType,
  NewItemMonitorTypes,
  BookAddType,
  type Author,
  type AuthorMetadata,
  type Book,
  type Edition,
  type SeriesBookLink,
} from "../../../books/models.js";
import { Quality } from "../../../qualities/quality.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { Revision } from "../../../qualities/revision.js";
import type { QualityModel } from "../../../qualities/qualityModel.js";
import type { CustomFormat } from "../../../custom-formats/customFormat.js";
import type {
  BookFileLike,
  QualityDefinitionServiceLike,
  CustomFormatCalculationServiceLike,
  INamingConfigServiceLike,
} from "../fileNameBuilder.js";
import { newNamingConfigDefault, type NamingConfig } from "../namingConfig.js";

/** Test-only fixture builders mirroring FizzWare.NBuilder's `.CreateNew()` defaults used throughout the real C# fixture files. */

export function makeAuthorMetadata(overrides: Partial<AuthorMetadata> = {}): AuthorMetadata {
  return {
    id: 0,
    foreignAuthorId: "",
    titleSlug: "",
    name: "",
    sortName: "",
    nameLastFirst: "",
    sortNameLastFirst: "",
    aliases: [],
    overview: null,
    disambiguation: null,
    gender: null,
    hometown: null,
    born: null,
    died: null,
    status: AuthorStatusType.Continuing,
    images: [],
    links: [],
    genres: [],
    ratings: { votes: 0, value: 0 },
    ...overrides,
  };
}

export function makeAuthor(overrides: Partial<Author> = {}): Author {
  const name = overrides.metadata?.name ?? "Test Author";
  return {
    id: 0,
    authorMetadataId: 0,
    cleanName: "",
    monitored: false,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: "",
    rootFolderPath: "",
    added: null,
    qualityProfileId: 0,
    metadataProfileId: 0,
    tags: [],
    metadata: makeAuthorMetadata({ name }),
    ...overrides,
  };
}

export function makeSeries(overrides: Partial<import("../../../books/models.js").Series> = {}) {
  return {
    id: 0,
    foreignSeriesId: "",
    title: "Series Title",
    description: null,
    numbered: true,
    workCount: 0,
    primaryWorkCount: 0,
    ...overrides,
  };
}

export function makeSeriesBookLink(overrides: Partial<SeriesBookLink> = {}): SeriesBookLink {
  return {
    id: 0,
    position: "1",
    seriesPosition: 1,
    seriesId: 0,
    bookId: 0,
    isPrimary: true,
    series: makeSeries(),
    ...overrides,
  };
}

export function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 0,
    authorMetadataId: 0,
    foreignBookId: "",
    titleSlug: "",
    title: "Test Book",
    releaseDate: null,
    links: [],
    genres: [],
    relatedBooks: [],
    ratings: { votes: 0, value: 0 },
    lastSearchTime: null,
    cleanTitle: "",
    monitored: false,
    anyEditionOk: false,
    lastInfoSync: null,
    added: null,
    addOptions: { addType: BookAddType.Automatic, searchForNewBook: false },
    seriesLinks: [],
    ...overrides,
  };
}

export function makeEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: 0,
    bookId: 0,
    foreignEditionId: "",
    titleSlug: "",
    isbn13: null,
    asin: null,
    title: "Test Edition",
    language: null,
    overview: "",
    format: null,
    isEbook: false,
    disambiguation: null,
    publisher: null,
    pageCount: 0,
    releaseDate: null,
    images: [],
    links: [],
    ratings: { votes: 0, value: 0 },
    monitored: false,
    manualAdd: false,
    ...overrides,
  };
}

export function makeBookFile(overrides: Partial<BookFileLike> = {}): BookFileLike {
  return {
    path: "",
    sceneName: null,
    releaseGroup: null,
    quality: newQualityModel(Quality.MP3),
    mediaInfo: null,
    part: 1,
    partCount: 1,
    ...overrides,
  };
}

export function makeQualityModel(quality = Quality.MP3, revision?: Revision): QualityModel {
  return newQualityModel(quality, revision);
}

export function makeNamingConfig(overrides: Partial<NamingConfig> = {}): NamingConfig {
  return { ...newNamingConfigDefault(), ...overrides };
}

/** Fake QualityDefinitionService: returns a definition whose title is the quality's own name (mirrors `Quality.DefaultQualityDefinitions.First(c => c.Quality == v)` from the C# fixtures, since Quality.name IS the display title for every quality in this port -- see qualities/quality.ts). */
export function makeQualityDefinitionService(): QualityDefinitionServiceLike {
  return {
    get: (quality: { id: number }) => {
      const match = Quality.All.find((q) => q.id === quality.id);
      return { title: match?.name ?? "Unknown" };
    },
  };
}

export function makeCustomFormatCalculationService(
  formats: CustomFormat[] = []
): CustomFormatCalculationServiceLike {
  return {
    parseCustomFormatForBookFile: () => formats,
  };
}

export function makeNamingConfigService(config: NamingConfig): INamingConfigServiceLike {
  return { getConfig: () => config };
}
