import { describe, expect, it, beforeEach } from "vitest";
import { FileNameBuilder } from "../fileNameBuilder.js";
import { Quality } from "../../../qualities/quality.js";
import {
  makeAuthor,
  makeBook,
  makeBookFile,
  makeCustomFormatCalculationService,
  makeEdition,
  makeNamingConfig,
  makeNamingConfigService,
  makeQualityDefinitionService,
  makeSeriesBookLink,
} from "./testHelpers.js";
import type { Book } from "../../../books/models.js";

/** Ported from NzbDrone.Core.Test/OrganizerTests/FileNameBuilderTests/NestedFileNameBuilderFixture.cs. */
describe("FileNameBuilder nested paths (NestedFileNameBuilderFixture)", () => {
  let book: Book;
  let subject: FileNameBuilder;
  let namingConfig: ReturnType<typeof makeNamingConfig>;
  let author: ReturnType<typeof makeAuthor>;
  let edition: ReturnType<typeof makeEdition>;
  let trackFile: ReturnType<typeof makeBookFile>;

  beforeEach(() => {
    author = makeAuthor({
      metadata: { ...makeAuthor().metadata!, name: "AuthorName", disambiguation: "US Author" },
    });

    book = makeBook({
      author: undefined,
      authorMetadata: author.metadata,
      title: "A Novel",
      releaseDate: new Date(Date.UTC(2020, 0, 15)).toISOString(),
      seriesLinks: [],
    });

    edition = makeEdition({
      monitored: true,
      book,
      title: "A Novel",
      releaseDate: new Date(Date.UTC(2020, 0, 15)).toISOString(),
    });

    namingConfig = makeNamingConfig({ renameBooks: true });

    trackFile = makeBookFile({
      quality: { quality: { id: Quality.MOBI.id } },
      releaseGroup: "ReadarrTest",
    });

    subject = new FileNameBuilder(
      makeNamingConfigService(namingConfig),
      makeQualityDefinitionService(),
      makeCustomFormatCalculationService([])
    );
  });

  function withSeries(): void {
    book.seriesLinks = [
      makeSeriesBookLink({
        series: {
          id: 0,
          foreignSeriesId: "",
          title: "A Series",
          description: null,
          numbered: true,
          workCount: 0,
          primaryWorkCount: 0,
        },
        position: "2-3",
        seriesPosition: 1,
      }),
    ];
  }

  it("should_build_nested_standard_track_filename_with_forward_slash", () => {
    withSeries();
    namingConfig.standardBookFormat =
      "{Book Series}/{Book SeriesTitle - }{Book Title} {(Release Year)}";

    expect(subject.buildBookFileName(author, edition, trackFile)).toBe(
      "A Series/A Series #2-3 - A Novel (2020)"
    );
  });

  it("should_build_standard_track_filename_with_forward_slash", () => {
    namingConfig.standardBookFormat =
      "{Book Series}/{Book SeriesTitle - }{Book Title} {(Release Year)}";

    expect(subject.buildBookFileName(author, edition, trackFile)).toBe("A Novel (2020)");
  });

  it("should_build_nested_standard_track_filename_with_back_slash", () => {
    withSeries();
    namingConfig.standardBookFormat =
      "{Book Series}\\{Book SeriesTitle - }{Book Title} {(Release Year)}";

    expect(subject.buildBookFileName(author, edition, trackFile)).toBe(
      "A Series/A Series #2-3 - A Novel (2020)"
    );
  });

  it("should_build_standard_track_filename_with_back_slash", () => {
    namingConfig.standardBookFormat =
      "{Book Series}\\{Book SeriesTitle - }{Book Title} {(Release Year)}";

    expect(subject.buildBookFileName(author, edition, trackFile)).toBe("A Novel (2020)");
  });
});
