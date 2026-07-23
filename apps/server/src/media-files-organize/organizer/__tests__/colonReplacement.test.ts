import { describe, expect, it } from "vitest";
import { FileNameBuilder } from "../fileNameBuilder.js";
import { Quality } from "../../../qualities/quality.js";
import { ColonReplacementFormat } from "../namingConfig.js";
import {
  makeAuthor,
  makeBook,
  makeBookFile,
  makeCustomFormatCalculationService,
  makeEdition,
  makeNamingConfig,
  makeNamingConfigService,
  makeQualityDefinitionService,
  makeSeries,
  makeSeriesBookLink,
} from "./testHelpers.js";

/** Ported from NzbDrone.Core.Test/OrganizerTests/FileNameBuilderTests/ColonReplacementFixture.cs. */
describe("FileNameBuilder ColonReplacementFormat (ColonReplacementFixture)", () => {
  function makeFixture(bookTitle = "Fake: Phantom Deadfall") {
    const author = makeAuthor({
      metadata: { ...makeAuthor().metadata!, name: "Christopher Hopper" },
    });
    const series = makeSeries({ title: "Series: Ruins of the Earth" });
    const seriesLink = makeSeriesBookLink({ position: "1-2", series });
    const book = makeBook({
      title: bookTitle,
      authorMetadata: author.metadata,
      releaseDate: new Date(Date.UTC(2021, 1, 14)).toISOString(),
      seriesLinks: [seriesLink],
    });
    const edition = makeEdition({
      monitored: true,
      book,
      title: book.title,
      releaseDate: new Date(Date.UTC(2021, 1, 17)).toISOString(),
    });
    const bookFile = makeBookFile({
      quality: { quality: { id: Quality.EPUB.id } },
      releaseGroup: "ReadarrTest",
    });

    return { author, book, edition, bookFile };
  }

  function makeSubject(namingConfig: ReturnType<typeof makeNamingConfig>): FileNameBuilder {
    return new FileNameBuilder(
      makeNamingConfigService(namingConfig),
      makeQualityDefinitionService(),
      makeCustomFormatCalculationService([])
    );
  }

  it("should_replace_colon_followed_by_space_with_space_dash_space_by_default", () => {
    const { author, edition, bookFile } = makeFixture();
    const namingConfig = makeNamingConfig({
      renameBooks: true,
      standardBookFormat: "{Author Name} - {Book SeriesTitle - }{Book Title} {(Release Year)}",
    });

    expect(makeSubject(namingConfig).buildBookFileName(author, edition, bookFile)).toBe(
      "Christopher Hopper - Series - Ruins of the Earth #1-2 - Fake - Phantom Deadfall (2021)"
    );
  });

  it.each([
    [
      ColonReplacementFormat.Smart,
      "Christopher Hopper - Series - Ruins of the Earth - Fake - Phantom Deadfall (2021)",
    ],
    [
      ColonReplacementFormat.Dash,
      "Christopher Hopper - Series- Ruins of the Earth - Fake- Phantom Deadfall (2021)",
    ],
    [
      ColonReplacementFormat.Delete,
      "Christopher Hopper - Series Ruins of the Earth - Fake Phantom Deadfall (2021)",
    ],
    [
      ColonReplacementFormat.SpaceDash,
      "Christopher Hopper - Series - Ruins of the Earth - Fake - Phantom Deadfall (2021)",
    ],
    [
      ColonReplacementFormat.SpaceDashSpace,
      "Christopher Hopper - Series - Ruins of the Earth - Fake - Phantom Deadfall (2021)",
    ],
  ])(
    "should_replace_colon_followed_by_space_with_expected_result (format=%s)",
    (format, expected) => {
      const { author, edition, bookFile } = makeFixture("Fake: Phantom Deadfall");
      const namingConfig = makeNamingConfig({
        renameBooks: true,
        standardBookFormat: "{Author Name} - {Book Series - }{Book Title} {(Release Year)}",
        colonReplacementFormat: format,
      });

      expect(makeSubject(namingConfig).buildBookFileName(author, edition, bookFile)).toBe(expected);
    }
  );

  it.each([
    [ColonReplacementFormat.Smart, "Author-Name"],
    [ColonReplacementFormat.Dash, "Author-Name"],
    [ColonReplacementFormat.Delete, "AuthorName"],
    [ColonReplacementFormat.SpaceDash, "Author -Name"],
    [ColonReplacementFormat.SpaceDashSpace, "Author - Name"],
  ])("should_replace_colon_with_expected_result (format=%s)", (format, expected) => {
    const { edition, bookFile } = makeFixture();
    const author = makeAuthor({ metadata: { ...makeAuthor().metadata!, name: "Author:Name" } });
    const namingConfig = makeNamingConfig({
      renameBooks: true,
      standardBookFormat: "{Author Name}",
      colonReplacementFormat: format,
    });

    expect(makeSubject(namingConfig).buildBookFileName(author, edition, bookFile)).toBe(expected);
  });
});
