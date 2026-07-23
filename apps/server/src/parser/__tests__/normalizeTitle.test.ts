import { describe, expect, it } from "vitest";
import { cleanAuthorName, normalizeTitle, normalizeTrackTitle } from "../parser.js";

/**
 * Ported from NzbDrone.Core.Test/ParserTests/NormalizeTitleFixture.cs.
 */

describe("cleanAuthorName (NormalizeTitleFixture)", () => {
  it.each<[string, string]>([
    ["Conan", "conan"],
    ["Castle (2009)", "castle2009"],
    ["Parenthood.2010", "parenthood2010"],
    ["Law_and_Order_SVU", "lawordersvu"],
  ])("should_normalize_author_title: %s -> %s", (parsedAuthorName, authorName) => {
    expect(cleanAuthorName(parsedAuthorName)).toBe(authorName);
  });

  it.each<[string, string]>([
    ["CaPitAl", "capital"],
    ["peri.od", "period"],
    ["this.^&%^**$%@#$!That", "thisthat"],
    ["test/test", "testtest"],
    ["90210", "90210"],
    ["24", "24"],
  ])("should_remove_special_characters_and_casing: %s -> %s", (dirty, clean) => {
    expect(cleanAuthorName(dirty)).toBe(clean);
  });

  it.each(["the", "and", "or", "an", "of"])(
    "should_remove_common_words_from_middle_of_title: %s",
    (word) => {
      const formats = ["word.{0}.word", "word {0} word", "word-{0}-word"];
      for (const fmt of formats) {
        const dirty = fmt.replace("{0}", word);
        expect(cleanAuthorName(dirty)).toBe("wordword");
      }
    }
  );

  it.each(["the", "and", "or", "an", "of"])(
    "should_not_remove_common_words_from_end_of_title: %s",
    (word) => {
      const formats = ["word.word.{0}", "word-word-{0}", "word-word {0}"];
      for (const fmt of formats) {
        const dirty = fmt.replace("{0}", word);
        expect(cleanAuthorName(dirty)).toBe("wordword" + word.toLowerCase());
      }
    }
  );

  it("should_remove_a_from_middle_of_title", () => {
    const formats = ["word.{0}.word", "word {0} word", "word-{0}-word"];
    for (const fmt of formats) {
      const dirty = fmt.replace("{0}", "a");
      expect(cleanAuthorName(dirty)).toBe("wordword");
    }
  });

  it.each(["the", "and", "or", "a", "an", "of"])(
    "should_not_remove_common_words_in_the_middle_of_word: %s",
    (word) => {
      const formats = [
        "word.{0}word",
        "word {0}word",
        "word-{0}word",
        "word{0}.word",
        "word{0}-word",
      ];
      for (const fmt of formats) {
        const dirty = fmt.replace("{0}", word);
        expect(cleanAuthorName(dirty)).toBe("word" + word.toLowerCase() + "word");
      }
    }
  );

  it.each<[string, string]>([
    ["The Office", "theoffice"],
    ["The Tonight Show With Jay Leno", "thetonightshowwithjayleno"],
    ["The.Daily.Show", "thedailyshow"],
  ])(
    "should_not_remove_from_the_beginning_of_the_title: %s -> %s",
    (parsedAuthorName, authorName) => {
      expect(cleanAuthorName(parsedAuthorName)).toBe(authorName);
    }
  );

  it.each(["the", "and", "or", "a", "an", "of"])(
    "should_not_clean_word_from_beginning_of_string: %s",
    (word) => {
      const formats = ["{0}.word.word", "{0}-word-word", "{0} word word"];
      for (const fmt of formats) {
        const dirty = fmt.replace("{0}", word);
        expect(cleanAuthorName(dirty)).toBe(word + "wordword");
      }
    }
  );

  it("should_not_clean_trailing_a", () => {
    expect(cleanAuthorName("Tokyo Ghoul A")).toBe("tokyoghoula");
  });

  it.each<[string, string]>([
    ["3%", "3percent"],
    ["Teen Top & 100% Outing Brothers", "teentop100percentoutingbrothers"],
    ["Big Jay Oakerson's What's Your F@%king Deal?!", "bigjayoakersonswhatsyourfkingdeal"],
  ])("should_replace_percent_sign_with_percent_following_numbers: %s -> %s", (input, expected) => {
    expect(cleanAuthorName(input)).toBe(expected);
  });
});

describe("normalizeTitle / normalizeTrackTitle (not covered by a dedicated C# fixture, exercised via Parser.cs's public surface)", () => {
  it("normalizeTitle strips word delimiters, punctuation, and common words", () => {
    expect(normalizeTitle("The Quick, Brown Fox!")).toBe("quick brown fox");
  });

  it("normalizeTrackTitle strips special episode words and punctuation", () => {
    expect(normalizeTrackTitle("Special Part One: The Beginning!")).toBe("one the beginning");
  });
});
