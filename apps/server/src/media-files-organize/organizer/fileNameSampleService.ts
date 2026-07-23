import {
  AuthorStatusType,
  BookAddType,
  NewItemMonitorTypes,
  type Author,
  type Book,
  type Edition,
} from "../../books/models.js";
import type { CustomFormat } from "../../custom-formats/customFormat.js";
import { Quality } from "../../qualities/quality.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { Revision } from "../../qualities/revision.js";
import type { FileNameBuilder, BookFileLike } from "./fileNameBuilder.js";
import { NamingFormatException } from "./errors.js";
import type { NamingConfig } from "./namingConfig.js";
import type { SampleResult } from "./sampleResult.js";

/**
 * Ported from NzbDrone.Core/Organizer/FileNameSampleService.cs.
 *
 * C# builds its sample Author/Book/Edition/BookFile/CustomFormat fixtures as
 * `private static` fields assigned once in the constructor -- ported here as
 * plain module-level construction inside the class constructor, matching
 * the same "build once, reuse across GetStandardTrackSample/
 * GetMultiDiscTrackSample/GetAuthorFolderSample calls" shape.
 */
export interface IFilenameSampleService {
  getStandardTrackSample(nameSpec: NamingConfig): SampleResult;
  getMultiDiscTrackSample(nameSpec: NamingConfig): SampleResult;
  getAuthorFolderSample(nameSpec: NamingConfig): string;
}

export class FileNameSampleService implements IFilenameSampleService {
  private readonly standardAuthor: Author;
  private readonly standardBook: Book;
  private readonly standardEdition: Edition;
  private readonly singleTrackFile: BookFileLike;
  private readonly multiTrackFile: BookFileLike;
  private readonly customFormats: CustomFormat[];

  constructor(private readonly buildFileNames: FileNameBuilder) {
    this.standardAuthor = {
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
      metadata: {
        id: 0,
        foreignAuthorId: "",
        titleSlug: "",
        name: "The Author Name",
        sortName: "",
        nameLastFirst: "Last name, First name",
        sortNameLastFirst: "",
        aliases: [],
        overview: null,
        disambiguation: "US Author",
        gender: null,
        hometown: null,
        born: null,
        died: null,
        status: AuthorStatusType.Continuing,
        images: [],
        links: [],
        genres: [],
        ratings: { votes: 0, value: 0 },
      },
    };

    const series = {
      id: 0,
      foreignSeriesId: "",
      title: "Series Title",
      description: null,
      numbered: true,
      workCount: 0,
      primaryWorkCount: 0,
    };

    const seriesLink = {
      id: 0,
      position: "1",
      seriesPosition: 1,
      seriesId: 0,
      bookId: 0,
      isPrimary: true,
      series,
    };

    this.standardBook = {
      id: 0,
      authorMetadataId: 0,
      foreignBookId: "",
      titleSlug: "",
      title: "The Book Title",
      releaseDate: new Date().toISOString(),
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
      author: this.standardAuthor,
      authorMetadata: this.standardAuthor.metadata,
      seriesLinks: [seriesLink],
    };

    this.standardEdition = {
      id: 0,
      bookId: 0,
      foreignEditionId: "",
      titleSlug: "",
      isbn13: null,
      asin: null,
      title: "The Edition Title",
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
      book: this.standardBook,
    };

    this.customFormats = [];

    const mediaInfo = {
      audioFormat: "Flac Audio",
      audioChannels: 2,
      audioBitrate: 875,
      audioBits: 24,
      audioSampleRate: 44100,
    };

    this.singleTrackFile = {
      quality: newQualityModel(Quality.MP3, new Revision({ version: 2 })),
      path: "/music/Author.Name.Book.Name.TrackNum.Track.Title.MP3256.mp3",
      sceneName: "Author.Name.Book.Name.TrackNum.Track.Title.MP3256",
      releaseGroup: "RlsGrp",
      mediaInfo,
      part: 1,
      partCount: 1,
    };

    this.multiTrackFile = {
      quality: newQualityModel(Quality.MP3, new Revision({ version: 2 })),
      path: "/music/Author.Name.Book.Name.TrackNum.Track.Title.MP3256.mp3",
      sceneName: "Author.Name.Book.Name.TrackNum.Track.Title.MP3256",
      releaseGroup: "RlsGrp",
      mediaInfo,
      part: 1,
      partCount: 2,
    };
  }

  getStandardTrackSample(nameSpec: NamingConfig): SampleResult {
    return {
      fileName: this.buildTrackSample(this.standardAuthor, this.singleTrackFile, nameSpec),
      author: this.standardAuthor,
      book: this.standardBook,
      bookFile: this.singleTrackFile,
    };
  }

  getMultiDiscTrackSample(nameSpec: NamingConfig): SampleResult {
    return {
      fileName: this.buildTrackSample(this.standardAuthor, this.multiTrackFile, nameSpec),
      author: this.standardAuthor,
      book: this.standardBook,
      // Ported verbatim: the C# source assigns `BookFile = _singleTrackFile`
      // here too (not `_multiTrackFile`), even though the FileName was built
      // from `_multiTrackFile` -- reproduced faithfully, not "fixed".
      bookFile: this.singleTrackFile,
    };
  }

  getAuthorFolderSample(nameSpec: NamingConfig): string {
    return this.buildFileNames.getAuthorFolder(this.standardAuthor, nameSpec);
  }

  private buildTrackSample(author: Author, bookFile: BookFileLike, nameSpec: NamingConfig): string {
    try {
      return this.buildFileNames.buildBookFileName(
        author,
        this.standardEdition,
        bookFile,
        nameSpec,
        this.customFormats
      );
    } catch (e) {
      if (e instanceof NamingFormatException) {
        return "";
      }
      throw e;
    }
  }
}
