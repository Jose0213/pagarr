import { describe, expect, it, beforeEach } from "vitest";
import { FileNameBuilder } from "../fileNameBuilder.js";
import { Quality } from "../../../qualities/quality.js";
import { Revision } from "../../../qualities/revision.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
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
import type { NamingConfig } from "../namingConfig.js";
import type { BookFileLike } from "../fileNameBuilder.js";
import type { Author, Book, Edition } from "../../../books/models.js";

/**
 * Ported from NzbDrone.Core.Test/OrganizerTests/FileNameBuilderTests/
 * FileNameBuilderFixture.cs. Translated NUnit `[Test]`/`[TestCase]` methods
 * to vitest `it`/`it.each`, preserving each test's name (snake_case ->
 * as-is, matching this repo's existing translated-test-file convention) and
 * assertions 1:1.
 */
describe("FileNameBuilder (FileNameBuilderFixture)", () => {
  let author: Author;
  let book: Book;
  let edition: Edition;
  let trackFile: BookFileLike;
  let namingConfig: NamingConfig;
  let subject: FileNameBuilder;

  beforeEach(() => {
    author = makeAuthor({
      metadata: {
        id: 0,
        foreignAuthorId: "",
        titleSlug: "",
        name: "Linkin Park",
        sortName: "",
        nameLastFirst: "",
        sortNameLastFirst: "",
        aliases: [],
        overview: null,
        disambiguation: "US Rock Band",
        gender: null,
        hometown: null,
        born: null,
        died: null,
        status: 0,
        images: [],
        links: [],
        genres: [],
        ratings: { votes: 0, value: 0 },
      },
    });

    const series = makeSeries({ title: "Series Title" });
    const seriesLink = makeSeriesBookLink({ position: "1-2", series });

    book = makeBook({
      title: "Hybrid Theory",
      authorMetadata: author.metadata,
      seriesLinks: [seriesLink],
    });

    edition = makeEdition({
      title: book.title,
      disambiguation: "The Best Book",
      book,
    });

    namingConfig = makeNamingConfig({ renameBooks: true });

    trackFile = makeBookFile({
      part: 1,
      partCount: 1,
      quality: newQualityModel(Quality.MP3) as unknown as { quality: { id: number } },
      releaseGroup: "ReadarrTest",
      mediaInfo: {
        audioBitrate: 320,
        audioBits: 16,
        audioChannels: 2,
        audioFormat: "Flac Audio",
        audioSampleRate: 44100,
      },
    });

    subject = new FileNameBuilder(
      makeNamingConfigService(namingConfig),
      makeQualityDefinitionService(),
      makeCustomFormatCalculationService([])
    );
  });

  function build(fileFile: BookFileLike = trackFile): string {
    return subject.buildBookFileName(author, edition, fileFile);
  }

  it("should_replace_Author_space_Name", () => {
    namingConfig.standardBookFormat = "{Author Name}";
    expect(build()).toBe("Linkin Park");
  });

  it("should_replace_Author_underscore_Name", () => {
    namingConfig.standardBookFormat = "{Author_Name}";
    expect(build()).toBe("Linkin_Park");
  });

  it("should_replace_Author_dot_Name", () => {
    namingConfig.standardBookFormat = "{Author.Name}";
    expect(build()).toBe("Linkin.Park");
  });

  it("should_replace_Author_dash_Name", () => {
    namingConfig.standardBookFormat = "{Author-Name}";
    expect(build()).toBe("Linkin-Park");
  });

  it("should_replace_ARTIST_NAME_with_all_caps", () => {
    namingConfig.standardBookFormat = "{AUTHOR NAME}";
    expect(build()).toBe("LINKIN PARK");
  });

  it("should_replace_ARTIST_NAME_with_random_casing_should_keep_original_casing", () => {
    namingConfig.standardBookFormat = "{aUtHoR-nAmE}";
    expect(build()).toBe(author.metadata!.name.replace(/ /g, "-"));
  });

  it("should_replace_author_name_with_all_lower_case", () => {
    namingConfig.standardBookFormat = "{author name}";
    expect(build()).toBe("linkin park");
  });

  it("should_cleanup_Author_Name", () => {
    namingConfig.standardBookFormat = "{Author.CleanName}";
    author.metadata!.name = "Linkin Park (1997)";
    expect(build()).toBe("Linkin.Park.1997");
  });

  it("should_replace_Author_Disambiguation", () => {
    namingConfig.standardBookFormat = "{Author Disambiguation}";
    expect(build()).toBe("US Rock Band");
  });

  it("should_replace_edition_space_Title", () => {
    namingConfig.standardBookFormat = "{Book Title}";
    expect(build()).toBe("Hybrid Theory");
  });

  it("should_replace_Book_Disambiguation", () => {
    namingConfig.standardBookFormat = "{Book Disambiguation}";
    expect(build()).toBe("The Best Book");
  });

  it("should_replace_Book_underscore_Title", () => {
    namingConfig.standardBookFormat = "{Book_Title}";
    expect(build()).toBe("Hybrid_Theory");
  });

  it("should_replace_Book_dot_Title", () => {
    namingConfig.standardBookFormat = "{Book.Title}";
    expect(build()).toBe("Hybrid.Theory");
  });

  it("should_replace_Book_dash_Title", () => {
    namingConfig.standardBookFormat = "{Book-Title}";
    expect(build()).toBe("Hybrid-Theory");
  });

  it("should_replace_ALBUM_TITLE_with_all_caps", () => {
    namingConfig.standardBookFormat = "{BOOK TITLE}";
    expect(build()).toBe("HYBRID THEORY");
  });

  it("should_replace_ALBUM_TITLE_with_random_casing_should_keep_original_casing", () => {
    namingConfig.standardBookFormat = "{bOoK-tItLE}";
    expect(build()).toBe(book.title.replace(/ /g, "-"));
  });

  it("should_replace_book_title_with_all_lower_case", () => {
    namingConfig.standardBookFormat = "{book title}";
    expect(build()).toBe("hybrid theory");
  });

  it("should_set_series", () => {
    namingConfig.standardBookFormat = "{Book Series}";
    expect(build()).toBe("Series Title");
  });

  it("should_set_series_number", () => {
    namingConfig.standardBookFormat = "{Book SeriesPosition}";
    expect(build()).toBe("1-2");
  });

  it("should_set_series_title", () => {
    namingConfig.standardBookFormat = "{Book SeriesTitle}";
    expect(build()).toBe("Series Title #1-2");
  });

  it("should_set_part_number", () => {
    namingConfig.standardBookFormat = "{(PartNumber)}";
    trackFile.partCount = 2;
    trackFile.part = 1;
    expect(build()).toBe("(1)");
  });

  it("should_set_part_number_with_prefix", () => {
    namingConfig.standardBookFormat = "{(ptPartNumber)}";
    trackFile.partCount = 2;
    trackFile.part = 1;
    expect(build()).toBe("(pt1)");
  });

  it("should_set_part_number_with_format", () => {
    namingConfig.standardBookFormat = "{(ptPartNumber:00)}";
    trackFile.partCount = 2;
    trackFile.part = 1;
    expect(build()).toBe("(pt01)");
  });

  it("should_set_part_number_and_count_with_format", () => {
    namingConfig.standardBookFormat = "{(ptPartNumber:00 of PartCount:00)}";
    trackFile.partCount = 2;
    trackFile.part = 1;
    expect(build()).toBe("(pt01 of 02)");
  });

  it("should_remove_part_token_for_single_files", () => {
    namingConfig.standardBookFormat = "{(ptPartNumber:00 of PartCount:00)}";
    trackFile.partCount = 1;
    trackFile.part = 1;
    expect(build()).toBe("");
  });

  it("part_regex_should_not_gobble_others", () => {
    namingConfig.standardBookFormat = "{Book Title}{ (PartNumber)} - {Author Name}";
    trackFile.part = 1;
    trackFile.partCount = 2;
    expect(build()).toBe("Hybrid Theory (1) - Linkin Park");
  });

  it("should_replace_quality_title", () => {
    namingConfig.standardBookFormat = "{Quality Title}";
    expect(build()).toBe("MP3");
  });

  it("should_replace_media_info_audio_codec", () => {
    namingConfig.standardBookFormat = "{MediaInfo AudioCodec}";
    expect(build()).toBe("FLAC");
  });

  it("should_replace_media_info_audio_bitrate", () => {
    namingConfig.standardBookFormat = "{MediaInfo AudioBitRate}";
    expect(build()).toBe("320 kbps");
  });

  it("should_replace_media_info_audio_channels", () => {
    namingConfig.standardBookFormat = "{MediaInfo AudioChannels}";
    expect(build()).toBe("2.0");
  });

  it("should_replace_media_info_bits_per_sample", () => {
    namingConfig.standardBookFormat = "{MediaInfo AudioBitsPerSample}";
    expect(build()).toBe("16bit");
  });

  it("should_replace_media_info_sample_rate", () => {
    namingConfig.standardBookFormat = "{MediaInfo AudioSampleRate}";
    expect(build()).toBe("44.1kHz");
  });

  it("should_replace_all_contents_in_pattern", () => {
    namingConfig.standardBookFormat = "{Author Name} - {Book Title} - [{Quality Title}]";
    expect(build()).toBe("Linkin Park - Hybrid Theory - [MP3]");
  });

  it("use_file_name_when_sceneName_is_null", () => {
    namingConfig.renameBooks = false;
    trackFile.path = "Linkin Park - 06 - Test";
    expect(build()).toBe("Linkin Park - 06 - Test");
  });

  it("use_file_name_when_sceneName_is_not_null", () => {
    namingConfig.renameBooks = false;
    trackFile.path = "Linkin Park - 06 - Test";
    trackFile.sceneName = "SceneName";
    expect(build()).toBe("Linkin Park - 06 - Test");
  });

  it("use_path_when_sceneName_and_relative_path_are_null", () => {
    namingConfig.renameBooks = false;
    trackFile.path = "C:\\Test\\Unsorted\\Author - 01 - Test";
    expect(build()).toBe("Author - 01 - Test");
  });

  it("should_should_replace_release_group", () => {
    namingConfig.standardBookFormat = "{Release Group}";
    expect(build()).toBe(trackFile.releaseGroup);
  });

  it("should_be_able_to_use_original_title", () => {
    author.metadata!.name = "Linkin Park";
    namingConfig.standardBookFormat = "{Author Name} - {Original Title}";
    trackFile.sceneName = "Linkin.Park.Meteora.320-LOL";
    trackFile.path = "30 Rock - 01 - Test";
    expect(build()).toBe("Linkin Park - Linkin.Park.Meteora.320-LOL");
  });

  it("should_replace_double_period_with_single_period", () => {
    namingConfig.standardBookFormat = "{Author.Name}.{Book.Title}";
    const woodsAuthor = makeAuthor({ metadata: { ...author.metadata!, name: "In The Woods." } });
    const otherEdition = makeEdition({
      title: "30 Rock",
      book: makeBook({ authorMetadata: { ...author.metadata!, name: "Author" }, seriesLinks: [] }),
    });
    expect(subject.buildBookFileName(woodsAuthor, otherEdition, trackFile)).toBe(
      "In.The.Woods.30.Rock"
    );
  });

  it("should_replace_triple_period_with_single_period", () => {
    namingConfig.standardBookFormat = "{Author.Name}.{Book.Title}";
    const woodsAuthor = makeAuthor({ metadata: { ...author.metadata!, name: "In The Woods..." } });
    const otherEdition = makeEdition({
      title: "30 Rock",
      book: makeBook({ authorMetadata: { ...author.metadata!, name: "Author" }, seriesLinks: [] }),
    });
    expect(subject.buildBookFileName(woodsAuthor, otherEdition, trackFile)).toBe(
      "In.The.Woods.30.Rock"
    );
  });

  it("should_include_affixes_if_value_not_empty", () => {
    namingConfig.standardBookFormat = "{Author.Name}{_Book.Title_}{Quality.Title}";
    expect(build()).toBe("Linkin.Park_Hybrid.Theory_MP3");
  });

  it("should_not_include_affixes_if_value_empty", () => {
    namingConfig.standardBookFormat = "{Author.Name}{_Book.Title_}";
    expect(build()).toBe("Linkin.Park_Hybrid.Theory");
  });

  it("should_remove_duplicate_non_word_characters", () => {
    author.metadata!.name = "Venture Bros.";
    namingConfig.standardBookFormat = "{Author.Name}.{Book.Title}";
    expect(build()).toBe("Venture.Bros.Hybrid.Theory");
  });

  it("should_use_existing_filename_when_scene_name_is_not_available", () => {
    namingConfig.renameBooks = true;
    namingConfig.standardBookFormat = "{Original Title}";
    trackFile.sceneName = null;
    trackFile.path = "existing.file.mkv";
    expect(build()).toBe("existing.file");
  });

  it("should_be_able_to_use_only_original_title", () => {
    author.metadata!.name = "30 Rock";
    namingConfig.standardBookFormat = "{Original Title}";
    trackFile.sceneName = "30.Rock.S01E01.xvid-LOL";
    trackFile.path = "30 Rock - S01E01 - Test";
    expect(build()).toBe("30.Rock.S01E01.xvid-LOL");
  });

  it("should_not_include_quality_proper_when_release_is_not_a_proper", () => {
    namingConfig.standardBookFormat = "{Quality Title} {Quality Proper}";
    expect(build()).toBe("MP3");
  });

  it("should_not_wrap_proper_in_square_brackets_when_not_a_proper", () => {
    namingConfig.standardBookFormat =
      "{Author Name} - {Book Title} [{Quality Title}] {[Quality Proper]}";
    expect(build()).toBe("Linkin Park - Hybrid Theory [MP3]");
  });

  it("should_replace_quality_full_with_quality_title_only_when_not_a_proper", () => {
    namingConfig.standardBookFormat = "{Author Name} - {Book Title} [{Quality Full}]";
    expect(build()).toBe("Linkin Park - Hybrid Theory [MP3]");
  });

  it.each([" ", "-", ".", "_"])(
    "should_trim_extra_separators_from_end_when_quality_proper_is_not_included (sep=%s)",
    (separator) => {
      namingConfig.standardBookFormat = `{Quality${separator}Title}${separator}{Quality${separator}Proper}`;
      expect(build()).toBe("MP3");
    }
  );

  it.each([" ", "-", ".", "_"])(
    "should_trim_extra_separators_from_middle_when_quality_proper_is_not_included (sep=%s)",
    (separator) => {
      namingConfig.standardBookFormat = `{Quality${separator}Title}${separator}{Quality${separator}Proper}${separator}{Book${separator}Title}`;
      expect(build()).toBe(`MP3${separator}Hybrid${separator}Theory`);
    }
  );

  it("should_be_able_to_use_original_filename", () => {
    author.metadata!.name = "30 Rock";
    namingConfig.standardBookFormat = "{Author Name} - {Original Filename}";
    trackFile.sceneName = "30.Rock.S01E01.xvid-LOL";
    trackFile.path = "30 Rock - S01E01 - Test";
    expect(build()).toBe("30 Rock - 30 Rock - S01E01 - Test");
  });

  it("should_be_able_to_use_original_filename_only", () => {
    author.metadata!.name = "30 Rock";
    namingConfig.standardBookFormat = "{Original Filename}";
    trackFile.sceneName = "30.Rock.S01E01.xvid-LOL";
    trackFile.path = "30 Rock - S01E01 - Test";
    expect(build()).toBe("30 Rock - S01E01 - Test");
  });

  it("should_use_Readarr_as_release_group_when_not_available", () => {
    trackFile.releaseGroup = null;
    namingConfig.standardBookFormat = "{Release Group}";
    expect(build()).toBe("Readarr");
  });

  it.each([
    ["{Book Title}{-Release Group}", "Hybrid Theory"],
    ["{Book Title}{ Release Group}", "Hybrid Theory"],
    ["{Book Title}{ [Release Group]}", "Hybrid Theory"],
  ])(
    "should_not_use_Readarr_as_release_group_if_pattern_has_separator (%s)",
    (pattern, expected) => {
      trackFile.releaseGroup = null;
      namingConfig.standardBookFormat = pattern;
      expect(build()).toBe(expected);
    }
  );

  it.each(["0SEC", "2HD", "IMMERSE"])(
    "should_use_existing_casing_for_release_group (%s)",
    (releaseGroup) => {
      trackFile.releaseGroup = releaseGroup;
      namingConfig.standardBookFormat = "{Release Group}";
      expect(build()).toBe(releaseGroup);
    }
  );

  it("should throw NamingFormatException when StandardBookFormat is empty and RenameBooks is true", () => {
    namingConfig.standardBookFormat = "";
    expect(() => build()).toThrow("File name format cannot be empty");
  });

  it("applies Proper revision to Quality Proper token", () => {
    namingConfig.standardBookFormat = "{Quality Proper}";
    trackFile.quality = newQualityModel(Quality.MP3, new Revision({ version: 2 }));
    expect(build()).toBe("Proper");
  });

  it("applies Repack revision to Quality Proper token", () => {
    namingConfig.standardBookFormat = "{Quality Proper}";
    trackFile.quality = newQualityModel(Quality.MP3, new Revision({ version: 2, isRepack: true }));
    expect(build()).toBe("Repack");
  });
});
