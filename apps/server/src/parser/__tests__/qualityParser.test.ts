import { describe, expect, it } from "vitest";
import { Quality } from "../../qualities/index.js";
import { Codec, parseCodec, parseQuality } from "../qualityParser.js";

/**
 * Ported from NzbDrone.Core.Test/ParserTests/QualityParserFixture.cs and
 * ExtendedQualityParserRegex.cs.
 */

describe("QualityParser.parseQuality: MP3", () => {
  it.each([
    "VA - The Best 101 Love Ballads (2017) MP3 [192 kbps]",
    "Maula - Jism 2 [2012] Mp3 - 192Kbps [Extended]- TK",
    "VA - Complete Clubland - The Ultimate Ride Of Your Lfe [2014][MP3][192 kbps]",
    "Complete Clubland - The Ultimate Ride Of Your Lfe [2014][MP3](192kbps)",
    "The Ultimate Ride Of Your Lfe [192 KBPS][2014][MP3]",
    "Gary Clark Jr - Live North America 2016 (2017) MP3 192kbps",
    "Some Song [192][2014][MP3]",
    "Other Song (192)[2014][MP3]",
    "Caetano Veloso Discografia Completa MP3 @256",
    "Jake Bugg - Jake Bugg (Book) [2012] {MP3 256 kbps}",
    "Clean Bandit - New Eyes [2014] [Mp3-256]-V3nom [GLT]",
    "PJ Harvey - Let England Shake [mp3-256-2011][trfkad]",
    "Childish Gambino - Awaken, My Love Book 2016 mp3 320 Kbps",
    "Maluma – Felices Los 4 MP3 320 Kbps 2017 Download",
    "Sia - This Is Acting (Standard Edition) [2016-Web-MP3-V0(VBR)]",
    "Mount Eerie - A Crow Looked at Me (2017) [MP3 V0 VBR)]",
    "Queen - The Ultimate Best Of Queen(2011)[mp3]",
    "Maroon 5 Ft Kendrick Lamar -Dont Wanna Know MP3 2016",
  ])("should_parse_mp3_quality: %s", (title) => {
    expect(parseQuality(title).quality.id).toBe(Quality.MP3.id);
  });
});

describe("QualityParser.parseQuality: FLAC", () => {
  it.each([
    "Kendrick Lamar - DAMN (2017) FLAC",
    "Alicia Keys - Vault Playlist Vol. 1 (2017) [FLAC CD]",
    "Gorillaz - Humanz (Deluxe) - lossless FLAC Tracks - 2017 - CDrip",
    "David Bowie - Blackstar (2016) [FLAC]",
    "The Cure - Greatest Hits (2001) FLAC Soup",
    "Slowdive- Souvlaki (FLAC)",
    "John Coltrane - Kulu Se Mama (1965) [EAC-FLAC]",
    "The Rolling Stones - The Very Best Of '75-'94 (1995) {FLAC}",
    "Migos-No_Label_II-CD-FLAC-2014-FORSAKEN",
    "ADELE 25 CD FLAC 2015 PERFECT",
  ])("should_parse_flac_quality: %s", (title) => {
    expect(parseQuality(title).quality.id).toBe(Quality.FLAC.id);
  });
});

describe("QualityParser.parseQuality: unknown", () => {
  it("should_not_parse_flac_quality (Flack doesn't get matched as FLAC)", () => {
    expect(parseQuality("Roberta Flack 2006 - The Very Best of").quality.id).toBe(
      Quality.Unknown.id
    );
  });

  it.each(["The Chainsmokers & Coldplay - Something Just Like This", "Frank Ocean Blonde 2016"])(
    "quality_parse: %s",
    (title) => {
      expect(parseQuality(title).quality.id).toBe(Quality.Unknown.id);
    }
  );
});

describe("QualityParser.parseQuality: self-quality-name round trip", () => {
  it.each([Quality.MP3, Quality.FLAC, Quality.EPUB, Quality.MOBI, Quality.AZW3])(
    "parsing_our_own_quality_enum_name: %s",
    (quality) => {
      const fileName = `Some book [${quality.name}]`;
      const result = parseQuality(fileName);
      expect(result.quality.id).toBe(quality.id);
    }
  );
});

describe("QualityParser.parseQuality: detection source", () => {
  it("should_parse_quality_from_name", () => {
    const result = parseQuality("Little Mix - Salute [Deluxe Edition] [2013] [M4A-256]-V3nom [GLT");
    expect(result.qualityDetectionSource).toBe("Name");
  });
});

describe("QualityParser.parseCodec", () => {
  it("should_parse_null_quality_description_as_unknown", () => {
    expect(parseCodec(null, "")).toBe(Codec.Unknown);
  });
});

describe("QualityParser.parseQuality: proper/repack revision", () => {
  it.each<[string, boolean]>([
    ["Author Title - Book Title 2017 REPACK FLAC aAF", true],
    ["Author Title - Book Title 2017 RERIP FLAC aAF", true],
    ["Author Title - Book Title 2017 PROPER FLAC aAF", false],
  ])("should_be_able_to_parse_repack: %s -> isRepack=%s", (title, isRepack) => {
    const result = parseQuality(title);
    expect(result.revision.version).toBe(2);
    expect(result.revision.isRepack).toBe(isRepack);
  });
});

describe("QualityParser.parseQuality: Real/version revision (ExtendedQualityParserRegex.cs)", () => {
  it.each<[string, number]>([
    ["Chuck.S04E05.HDTV.XviD-LOL", 0],
    ["Gold.Rush.S04E05.Garnets.or.Gold.REAL.REAL.PROPER.HDTV.x264-W4F", 2],
    ["Chuck.S03E17.REAL.PROPER.720p.HDTV.x264-ORENJI-RP", 1],
    ["Covert.Affairs.S05E09.REAL.PROPER.HDTV.x264-KILLERS", 1],
    ["Mythbusters.S14E01.REAL.PROPER.720p.HDTV.x264-KILLERS", 1],
    ["Orange.Is.the.New.Black.s02e06.real.proper.720p.webrip.x264-2hd", 0],
    ["Top.Gear.S21E07.Super.Duper.Real.Proper.HDTV.x264-FTP", 0],
    ["Top.Gear.S21E07.PROPER.HDTV.x264-RiVER-RP", 0],
    ["House.S07E11.PROPER.REAL.RERIP.1080p.BluRay.x264-TENEIGHTY", 1],
    ["[MGS] - Kuragehime - Episode 02v2 - [D8B6C90D]", 0],
    ["[Hatsuyuki] Tokyo Ghoul - 07 [v2][848x480][23D8F455].avi", 0],
    ["[DeadFish] Barakamon - 01v3 [720p][AAC]", 0],
    ["[DeadFish] Momo Kyun Sword - 01v4 [720p][AAC]", 0],
    ["The Real Housewives of Some Place - S01E01 - Why are we doing this?", 0],
  ])("should_parse_reality_from_title: %s -> %s", (title, reality) => {
    expect(parseQuality(title).revision.real).toBe(reality);
  });

  it.each<[string, number]>([
    ["Chuck.S04E05.HDTV.XviD-LOL", 1],
    ["Gold.Rush.S04E05.Garnets.or.Gold.REAL.REAL.PROPER.HDTV.x264-W4F", 2],
    ["Chuck.S03E17.REAL.PROPER.720p.HDTV.x264-ORENJI-RP", 2],
    ["Covert.Affairs.S05E09.REAL.PROPER.HDTV.x264-KILLERS", 2],
    ["Mythbusters.S14E01.REAL.PROPER.720p.HDTV.x264-KILLERS", 2],
    ["Orange.Is.the.New.Black.s02e06.real.proper.720p.webrip.x264-2hd", 2],
    ["Top.Gear.S21E07.Super.Duper.Real.Proper.HDTV.x264-FTP", 2],
    ["Top.Gear.S21E07.PROPER.HDTV.x264-RiVER-RP", 2],
    ["House.S07E11.PROPER.REAL.RERIP.1080p.BluRay.x264-TENEIGHTY", 2],
    ["[MGS] - Kuragehime - Episode 02v2 - [D8B6C90D]", 2],
    ["[Hatsuyuki] Tokyo Ghoul - 07 [v2][848x480][23D8F455].avi", 2],
    ["[DeadFish] Momo Kyun Sword - 01v4 [720p][AAC]", 4],
    ["[Vivid-Asenshi] Akame ga Kill - 04v2 [266EE983]", 2],
    ["[Vivid-Asenshi] Akame ga Kill - 03v2 [66A05817]", 2],
    ["[Vivid-Asenshi] Akame ga Kill - 02v2 [1F67AB55]", 2],
  ])("should_parse_version_from_title: %s -> %s", (title, version) => {
    expect(parseQuality(title).revision.version).toBe(version);
  });
});

describe("QualityParser.parseQuality: books (real Pagarr behavior beyond the C# music-oriented fixture)", () => {
  it.each<[string, ReturnType<typeof Quality.FindById>]>([
    ["Some Book [PDF]", Quality.PDF],
    ["Some Book [EPUB]", Quality.EPUB],
    ["Some Book [MOBI]", Quality.MOBI],
    ["Some Book [AZW3]", Quality.AZW3],
  ])("parses book-format quality from name: %s -> %s", (title, quality) => {
    expect(parseQuality(title).quality.id).toBe(quality.id);
  });

  it("falls back to extension-based detection when name has no quality hint", () => {
    // ".kepub" maps to Quality.EPUB in MediaFileExtensions (qualityParser.ts)
    // but ISN'T one of CODEC_REGEX's literal keywords, so name-based
    // detection genuinely misses it and the extension-based fallback is
    // what actually classifies it -- unlike a plain ".epub" filename, which
    // always matches the name-based EPUB codec keyword first since the
    // extension text itself is scanned as part of the name.
    const result = parseQuality("some-book-with-no-hints.kepub");
    expect(result.quality.id).toBe(Quality.EPUB.id);
    expect(result.qualityDetectionSource).toBe("Extension");
  });

  it("falls back to category-based UnknownAudio detection for audio categories", () => {
    const result = parseQuality("Totally ambiguous release", null, [3010]);
    expect(result.quality.id).toBe(Quality.UnknownAudio.id);
    expect(result.qualityDetectionSource).toBe("Category");
  });

  it("returns Unknown quality (no source set) for both name and desc blank", () => {
    const result = parseQuality("", "");
    expect(result.quality.id).toBe(Quality.Unknown.id);
    expect(result.qualityDetectionSource).toBeUndefined();
  });
});
