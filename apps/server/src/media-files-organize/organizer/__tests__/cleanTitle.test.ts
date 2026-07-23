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

/** Ported from NzbDrone.Core.Test/OrganizerTests/FileNameBuilderTests/CleanTitleFixture.cs. */
describe("FileNameBuilder {Author CleanName} (CleanTitleFixture)", () => {
  it.each([
    ["Florence + the Machine", "Florence + the Machine"],
    ["Beyoncé X10", "Beyoncé X10"],
    ["Girlfriends' Guide to Divorce", "Girlfriends Guide to Divorce"],
    ["Rule #23: Never Lie to the Kids", "Rule #23 Never Lie to the Kids"],
    ["Anne Hathaway/Florence + The Machine", "Anne Hathaway Florence + The Machine"],
    ["Chris Rock/Prince", "Chris Rock Prince"],
    ["Karma's a B*tch!", "Karmas a B-tch!"],
    ["Ke$ha: My Crazy Beautiful Life", "Ke$ha My Crazy Beautiful Life"],
    ["$#*! My Dad Says", "$#-! My Dad Says"],
    ["Free! - Iwatobi Swim Club", "Free! Iwatobi Swim Club"],
    ["Tamara Ecclestone: Billion $$ Girl", "Tamara Ecclestone Billion $$ Girl"],
    ["Marvel's Agents of S.H.I.E.L.D.", "Marvels Agents of S.H.I.E.L.D"],
    ["Castle (2009)", "Castle 2009"],
    ["Law & Order (UK)", "Law and Order UK"],
    ["Is this okay?", "Is this okay"],
    ["[a] title", "a title"],
    ["backslash \\ backlash", "backslash backlash"],
    ["I'm the Boss", "Im the Boss"],
  ])("should_get_expected_title_back (%s)", (name, expected) => {
    const author = makeAuthor({ metadata: { ...makeAuthor().metadata!, name } });
    const series = makeSeries({ title: "Series Title" });
    const seriesLink = makeSeriesBookLink({ position: "1-2", series });
    const book = makeBook({
      title: "Hail to the King",
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
      standardBookFormat: "{Author CleanName}",
    });

    const subject = new FileNameBuilder(
      makeNamingConfigService(namingConfig),
      makeQualityDefinitionService(),
      makeCustomFormatCalculationService([])
    );

    expect(subject.buildBookFileName(author, edition, trackFile)).toBe(expected);
  });
});
