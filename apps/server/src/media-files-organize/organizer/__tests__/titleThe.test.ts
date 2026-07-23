import { describe, expect, it } from "vitest";
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
  makeSeries,
  makeSeriesBookLink,
} from "./testHelpers.js";

/** Ported from NzbDrone.Core.Test/OrganizerTests/FileNameBuilderTests/TitleTheFixture.cs. */
describe("FileNameBuilder {Author NameThe} (TitleTheFixture)", () => {
  function build(name: string): string {
    const author = makeAuthor({ metadata: { ...makeAuthor().metadata!, name } });
    const series = makeSeries({ title: "Series Title" });
    const seriesLink = makeSeriesBookLink({ position: "1-2", series });
    const book = makeBook({
      title: "Anthology",
      authorMetadata: author.metadata,
      seriesLinks: [seriesLink],
    });
    const edition = makeEdition({ title: book.title, book });
    const trackFile = makeBookFile({
      quality: { quality: { id: Quality.MP3.id } },
      releaseGroup: "ReadarrTest",
    });

    const namingConfig = makeNamingConfig({
      renameBooks: true,
      standardBookFormat: "{Author NameThe}",
    });

    const subject = new FileNameBuilder(
      makeNamingConfigService(namingConfig),
      makeQualityDefinitionService(),
      makeCustomFormatCalculationService([])
    );

    return subject.buildBookFileName(author, edition, trackFile);
  }

  it.each([
    ["The Mist", "Mist, The"],
    ["A Place to Call Home", "Place to Call Home, A"],
    ["An Adventure in Space and Time", "Adventure in Space and Time, An"],
    ["The Flash (2010)", "Flash, The (2010)"],
    ["A League Of Their Own (AU)", "League Of Their Own, A (AU)"],
    ["The Fixer (ZH) (2015)", "Fixer, The (ZH) (2015)"],
    ["The Sixth Sense 2 (Thai)", "Sixth Sense 2, The (Thai)"],
    ["The Amazing Race (Latin America)", "Amazing Race, The (Latin America)"],
    ["The Rat Pack (A&E)", "Rat Pack, The (A&E)"],
    [
      "The Climax: I (Almost) Got Away With It (2016)",
      "Climax - I (Almost) Got Away With It, The (2016)",
    ],
  ])("should_get_expected_title_back (%s)", (name, expected) => {
    expect(build(name)).toBe(expected);
  });

  it.each(["A", "Anne", "Theodore", "3%"])("should_not_change_title (%s)", (name) => {
    expect(build(name)).toBe(name);
  });
});
