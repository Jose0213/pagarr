import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  newAuthor,
  newAuthorMetadata,
  newBook,
  newEdition,
  type Author,
  type Book,
} from "../../books/index.js";
import { Quality } from "../../qualities/index.js";
import {
  cleanAuthorName,
  cleanBookTitle,
  cleanTrackTitle,
  parseAuthorName,
  parseBookTitle,
  parseBookTitleWithSearchCriteria,
  parseReleaseGroup,
  parseTitle,
  splitBookTitle,
} from "../parser.js";

/**
 * Ported from NzbDrone.Core.Test/ParserTests/ParserFixture.cs. Every
 * [TestCase] here is translated 1:1 from the real C# fixture (including
 * the commented-out/known-not-yet-working cases the C# source itself
 * leaves commented out -- those are omitted here too, matching the
 * original test file's own scope).
 */

function buildAuthor(name: string): Author {
  return { ...newAuthor(), metadata: { ...newAuthorMetadata(), name } };
}

function buildBookWithMonitoredEdition(title: string): Book {
  return {
    ...newBook(),
    title,
    editions: [{ ...newEdition(), title, monitored: true }],
  };
}

describe("Parser.parseAuthorName", () => {
  it.each([["Bad Format", "badformat"]])(
    "should_parse_author_name: %s -> %s",
    (postTitle, title) => {
      const result = cleanAuthorName(parseAuthorName(postTitle));
      expect(result).toBe(cleanAuthorName(title));
    }
  );

  it("should_remove_accents_from_title", () => {
    const title = "Carnivàle";
    expect(cleanAuthorName(title)).toBe("carnivale");
  });
});

describe("Parser.cleanBookTitle", () => {
  it.each([
    ["Songs of Experience (Deluxe Edition)", "Songs of Experience"],
    ["Songs of Experience (iTunes Deluxe Edition)", "Songs of Experience"],
    ["Songs of Experience [Super Special Edition]", "Songs of Experience"],
    ["Mr. Bad Guy [Special Edition]", "Mr. Bad Guy"],
    ["Sweet Dreams (Book)", "Sweet Dreams"],
    ["Now What?! (Limited Edition)", "Now What?!"],
    ["Random Book Title (Promo CD)", "Random Book Title"],
    ["Hello, I Must Be Going (2016 Remastered)", "Hello, I Must Be Going"],
    ["Limited Edition", "Limited Edition"],
  ])("should_remove_common_tags_from_book_title: %s -> %s", (title, correct) => {
    expect(cleanBookTitle(title)).toBe(correct);
  });
});

describe("Parser.cleanTrackTitle", () => {
  it.each([
    ["Songs of Experience (Deluxe Edition)", "Songs of Experience"],
    ["Mr. Bad Guy [Special Edition]", "Mr. Bad Guy"],
    ["Smooth Criminal (single)", "Smooth Criminal"],
    [
      "Wie Maak Die Jol Vol (Ft. Isaac Mutant, Knoffel, Jaak Paarl & Scallywag)",
      "Wie Maak Die Jol Vol",
    ],
    ["Alles Schon Gesehen (Feat. Deichkind)", "Alles Schon Gesehen"],
    ["Science Fiction/Double Feature", "Science Fiction/Double Feature"],
    ["Dancing Feathers", "Dancing Feathers"],
  ])("should_remove_common_tags_from_track_title: %s -> %s", (title, correct) => {
    expect(cleanTrackTitle(title)).toBe(correct);
  });
});

describe("Parser.parseBookTitle: request info removal", () => {
  it("should_remove_request_info_from_title", () => {
    const result = parseBookTitle("[scnzbefnet][509103] Jay-Z - 4:44 (Deluxe Edition) (2017) 320");
    expect(result?.authorName).toBe("Jay-Z");
  });
});

describe("Parser.parseBookTitle: author name and book title", () => {
  it.each<[string, string, string, boolean?]>([
    ["VA - The Best 101 Love Ballads (2017) MP3 [192 kbps]", "VA", "The Best 101 Love Ballads"],
    ["ATCQ - The Love Movement 1998 2CD 192kbps  RIP", "ATCQ", "The Love Movement"],
    ["Maula - Jism 2 [2012] Mp3 - 192Kbps [Extended]- TK", "Maula", "Jism 2"],
    [
      "VA - Complete Clubland - The Ultimate Ride Of Your Lfe [2014][MP3][192 kbps]",
      "VA",
      "Complete Clubland - The Ultimate Ride Of Your Lfe",
    ],
    [
      "Complete Clubland - The Ultimate Ride Of Your Lfe [2014][MP3](192kbps)",
      "Complete Clubland",
      "The Ultimate Ride Of Your Lfe",
    ],
    [
      "Gary Clark Jr - Live North America 2016 (2017) MP3 192kbps",
      "Gary Clark Jr",
      "Live North America 2016",
    ],
    [
      "Childish Gambino - Awaken, My Love Book 2016 mp3 320 Kbps",
      "Childish Gambino",
      "Awaken, My Love Book",
    ],
    ["Ricardo Arjona - APNEA (Single 2014) (320 kbps)", "Ricardo Arjona", "APNEA"],
    ["Kehlani - SweetSexySavage (Deluxe Edition) (2017) 320", "Kehlani", "SweetSexySavage"],
    ["Anderson Paak - Malibu (320)(2016)", "Anderson Paak", "Malibu"],
    ["Caetano Veloso Discografia Completa MP3 @256", "Caetano Veloso", "Discography", true],
    ["Little Mix - Salute [Deluxe Edition] [2013] [M4A-256]-V3nom [GLT", "Little Mix", "Salute"],
    [
      "Ricky Martin - A Quien Quiera Escuchar (2015) 256 kbps [GloDLS]",
      "Ricky Martin",
      "A Quien Quiera Escuchar",
    ],
    ["Jake Bugg - Jake Bugg (Book) [2012] {MP3 256 kbps}", "Jake Bugg", "Jake Bugg"],
    ["Milky Chance - Sadnecessary [256 Kbps] [M4A]", "Milky Chance", "Sadnecessary"],
    ["Clean Bandit - New Eyes [2014] [Mp3-256]-V3nom [GLT]", "Clean Bandit", "New Eyes"],
    [
      "Armin van Buuren - A State Of Trance 810 (20.04.2017) 256 kbps",
      "Armin van Buuren",
      "A State Of Trance 810",
    ],
    ["PJ Harvey - Let England Shake [mp3-256-2011][trfkad]", "PJ Harvey", "Let England Shake"],
    ["Kendrick Lamar - DAMN (2017) FLAC", "Kendrick Lamar", "DAMN"],
    [
      "Alicia Keys - Vault Playlist Vol. 1 (2017) [FLAC CD]",
      "Alicia Keys",
      "Vault Playlist Vol  1",
    ],
    ["Gorillaz - Humanz (Deluxe) - lossless FLAC Tracks - 2017 - CDrip", "Gorillaz", "Humanz"],
    ["David Bowie - Blackstar (2016) [FLAC]", "David Bowie", "Blackstar"],
    ["The Cure - Greatest Hits (2001) FLAC Soup", "The Cure", "Greatest Hits"],
    ["Slowdive - Souvlaki (FLAC)", "Slowdive", "Souvlaki"],
    ["John Coltrane - Kulu Se Mama (1965) [EAC-FLAC]", "John Coltrane", "Kulu Se Mama"],
    [
      "The Rolling Stones - The Very Best Of '75-'94 (1995) {FLAC}",
      "The Rolling Stones",
      "The Very Best Of '75-'94",
    ],
    ["Migos-No_Label_II-CD-FLAC-2014-FORSAKEN", "Migos", "No Label II"],
    ["A.I. - Sex & Robots [2007/MP3/V0(VBR)]", "A I", "Sex & Robots"],
    ["Jay-Z - 4:44 (Deluxe Edition) (2017) 320", "Jay-Z", "4:44"],
    [
      "VA - NOW Thats What I Call Music 96 (2017) [Mp3~Kbps]",
      "VA",
      "NOW Thats What I Call Music 96",
    ],
    ["Queen - The Ultimate Best Of Queen(2011)[mp3]", "Queen", "The Ultimate Best Of Queen"],
    ["Little Mix - Salute [Deluxe Edition] [2013] [M4A-256]-V3nom [GLT]", "Little Mix", "Salute"],
    ["Barış Manço - Ben Bilirim [1993/FLAC/Lossless/Log]", "Barış Manço", "Ben Bilirim"],
    [
      "Imagine Dragons-Smoke And Mirrors-Deluxe Edition-2CD-FLAC-2015-JLM",
      "Imagine Dragons",
      "Smoke And Mirrors",
    ],
    ["Dani_Sbert-Togheter-WEB-2017-FURY", "Dani Sbert", "Togheter"],
    ["New.Edition-One.Love-CD-FLAC-2017-MrFlac", "New Edition", "One Love"],
    [
      "David_Gray-The_Best_of_David_Gray-(Deluxe_Edition)-2CD-2016-MTD",
      "David Gray",
      "The Best of David Gray",
    ],
    ["Shinedown-Us and Them-NMR-2005-NMR", "Shinedown", "Us and Them"],
    [
      "Led Zeppelin - Studio Discography 1969-1982 (10 books)(flac)",
      "Led Zeppelin",
      "Discography",
      true,
    ],
    ["Minor Threat - Complete Discography [1989] [Anthology]", "Minor Threat", "Discography", true],
    ["Captain-Discography_1998_-_2001-CD-FLAC-2007-UTP", "Captain", "Discography", true],
    ["Coolio - Gangsta's Paradise (1995) (FLAC Lossless)", "Coolio", "Gangsta's Paradise"],
    ["Brother Ali-2007-The Undisputed Truth-FTD", "Brother Ali", "The Undisputed Truth"],
    ["Brother Ali-The Undisputed Truth-2007-FTD", "Brother Ali", "The Undisputed Truth"],
    // MAM
    ["City of Bones by Cassandra Clare [ENG / epub]", "Cassandra Clare", "City of Bones"],
    [
      "The Ivory Tower and Harry Potter -​ Perspectives on a Literary Phenomenon by Lana E Whited [ENG /​ pdf]",
      "Lana E Whited",
      "The Ivory Tower and Harry Potter -​ Perspectives on a Literary Phenomenon",
    ],
    ["America by design by David Noble [eng]", "David Noble", "America by design"],
    ["The Great Gatsby by F. Scott Fitzgerald [azw3]", "F  Scott Fitzgerald", "The Great Gatsby"],
    ["Megabytes by Computer [pdf]", "Computer", "Megabytes"],
    // ruTracker
    [
      "(Eclectic Progressive Rock) [CD] Peter Hammill - From The Trees - 2017, FLAC (tracks + .cue), lossless",
      "Peter Hammill",
      "From The Trees",
    ],
    ["(Folk Rock / Pop) Aztec Two-Step - Naked - 2017, MP3, 320 kbps", "Aztec Two-Step", "Naked"],
    [
      "(Zeuhl / Progressive Rock) [WEB] Dai Kaht - Dai Kaht - 2017, FLAC (tracks), lossless",
      "Dai Kaht",
      "Dai Kaht",
    ],
    [
      "(Heavy Metal) [CD] Black Obelisk - Discography - 1991-2015 (36 releases, 32 CDs), FLAC(image + .cue), lossless",
      "Black Obelisk",
      "Discography",
      true,
    ],
    [
      "(Heavy Metal) Aria - Discography(46 CD) [1985 - 2015], FLAC(image + .cue), lossless",
      "Aria",
      "Discography",
      true,
    ],
    [
      "(Heavy Metal) [CD] Forces United - Discography(6 CDs), 2014-2016, FLAC(image + .cue), lossless",
      "Forces United",
      "Discography",
      true,
    ],
    ["Gorillaz - The now now - 2018 [FLAC]", "Gorillaz", "The now now"],
  ])(
    "should_parse_author_name_and_book_title: %s",
    (postTitle, name, title, discography = false) => {
      const parseResult = parseBookTitle(postTitle);
      expect(parseResult?.authorName).toBe(name);
      expect(parseResult?.bookTitle).toBe(title);
      expect(parseResult?.discography).toBe(discography);
    }
  );
});

describe("Parser.parseBookTitleWithSearchCriteria", () => {
  it.each([
    "Black Sabbath - Black Sabbath FLAC",
    "Black Sabbath Black Sabbath FLAC",
    "BlaCk SabBaTh Black SabBatH FLAC",
    "Black Sabbath FLAC Black Sabbath",
    "Black.Sabbath-FLAC-Black.Sabbath",
    "Black_Sabbath-FLAC-Black_Sabbath",
  ])("should_parse_author_name_and_book_title_by_search_criteria: %s", (releaseTitle) => {
    const author = buildAuthor("Black Sabbath");
    const books = [buildBookWithMonitoredEdition("Black Sabbath")];

    const parseResult = parseBookTitleWithSearchCriteria(releaseTitle, author, books);
    expect(parseResult?.authorName.toLowerCase()).toBe("black sabbath");
    expect(parseResult?.bookTitle?.toLowerCase()).toBe("black sabbath");
  });

  it.each<[string, string, string]>([
    ["Captain-Discography_1998_-_2001-CD-FLAC-2007-UTP", "1998", "2001"],
  ])("discography edge case parses via plain parseBookTitle: %s", (releaseTitle) => {
    const parseResult = parseBookTitle(releaseTitle);
    expect(parseResult?.discography).toBe(true);
  });

  it.each<[string, string, string, string]>([
    ["Abba", "Abba", "Black Sabbath  Black Sabbath FLAC", ""],
    ["Anthony Horowitz", "Oblivion", "The Elder Scrolls IV Oblivion+Expansions", ""],
    ["Danielle Steel", "Zoya", "DanielleSteelZoya.zip", ""],
    ["Stephen King", "It", "Stephen Kingston - Spirit Doll (retail) (azw3)", ""],
    [
      "Stephen King",
      "It",
      "Stephen_Cleobury-The_Music_of_Kings_Choral_Favourites_from_Cambridge-WEB-2019-ENRiCH",
      "",
    ],
    ["Stephen King", "Guns", "Stephen King - The Gunslinger: Dark Tower 1 MP3", ""],
    ["Rick Riordan", "An Interview with Rick Riordan", "AnInterviewwithRickRiordan_ep6", ""],
  ])(
    "should_not_parse_author_name_and_book_title_by_incorrect_search_criteria: %s / %s <- %s",
    (searchAuthor, searchBook, report) => {
      const author = buildAuthor(searchAuthor);
      const books = [buildBookWithMonitoredEdition(searchBook)];

      const parseResult = parseBookTitleWithSearchCriteria(report, author, books);
      expect(parseResult).toBeNull();
    }
  );

  it.each<[string, string, string, string, string]>([
    [
      "George R.R. Martin",
      "The Hero",
      "The Hero George R R Martin",
      "George R R Martin",
      "The Hero",
    ],
    [
      "James Herbert",
      "48",
      "James Hertbert Collection/'48 - James Herbert (epub)",
      "James Herbert",
      "48",
    ],
  ])(
    "should_parse_with_search_criteria: %s / %s <- %s",
    (searchAuthor, searchBook, report, expectedAuthor, expectedBook) => {
      const author = buildAuthor(searchAuthor);
      const books = [buildBookWithMonitoredEdition(searchBook)];

      const parseResult = parseBookTitleWithSearchCriteria(report, author, books);
      expect(parseResult?.authorName).toBe(expectedAuthor);
      expect(parseResult?.bookTitle).toBe(expectedBook);
    }
  );

  it.each<[string, string, string]>([
    ["Ed Sheeran", "I See Fire", "Ed Sheeran I See Fire[Mimp3.eu].mp3 FLAC"],
    ["Ed Sheeran", "Divide", "Ed Sheeran   ? Divide FLAC"],
    ["Ed Sheeran", "+", "Ed Sheeran + FLAC"],
    ["XXXTENTACION", "?", "XXXTENTACION ? FLAC"],
    ["Hey", "BŁYSK", "Hey - BŁYSK FLAC"],
  ])("should_escape_books: %s / %s <- %s", (author, book, releaseTitle) => {
    const searchAuthor = buildAuthor(author);
    const books = [buildBookWithMonitoredEdition(book)];

    const parseResult = parseBookTitleWithSearchCriteria(releaseTitle, searchAuthor, books);
    expect(parseResult?.bookTitle).toBe(book);
  });

  it.each<[string, string, string]>([
    ["???", "Book", "??? Book FLAC"],
    ["+", "Book", "+ Book FLAC"],
    ["/\\", "Book", "/\\ Book FLAC"],
    ["+44", "When Your Heart Stops Beating", "+44 When Your Heart Stops Beating FLAC"],
  ])("should_escape_authors: %s / %s <- %s", (author, book, releaseTitle) => {
    const searchAuthor = buildAuthor(author);
    const books = [buildBookWithMonitoredEdition(book)];

    const parseResult = parseBookTitleWithSearchCriteria(releaseTitle, searchAuthor, books);
    expect(parseResult?.authorName).toBe(author);
  });

  it("should_match_with_accent_in_author_and_book", () => {
    const author = buildAuthor("Michael Bublé");
    const books = [buildBookWithMonitoredEdition("Michael Bublé")];

    const parseResult = parseBookTitleWithSearchCriteria(
      "Michael Buble Michael Buble CD FLAC 2003 PERFECT",
      author,
      books
    );
    expect(parseResult?.authorName).toBe("Michael Buble");
    expect(parseResult?.bookTitle).toBe("Michael Buble");
  });

  it("should_find_result_if_multiple_books_in_searchcriteria", () => {
    const author = buildAuthor("Michael Bublé");
    const books = [
      buildBookWithMonitoredEdition("Call Me Irresponsible"),
      buildBookWithMonitoredEdition("Michael Bublé"),
      buildBookWithMonitoredEdition("love"),
      buildBookWithMonitoredEdition("Christmas"),
      buildBookWithMonitoredEdition("To Be Loved"),
    ];

    const parseResult = parseBookTitleWithSearchCriteria(
      "Michael Buble Christmas (Deluxe Special Edition) CD FLAC 2012 UNDERTONE iNT",
      author,
      books
    );
    expect(parseResult?.authorName).toBe("Michael Buble");
    expect(parseResult?.bookTitle).toBe("Christmas");
  });
});

describe("Parser.splitBookTitle", () => {
  it.each<[string, string, string, string]>([
    ["Tom Clancy", "Tom Clancy: Ghost Protocol", "Ghost Protocol", ""],
    [
      "Andrew Steele",
      "Ageless: The New Science of Getting Older Without Getting Old",
      "Ageless",
      "The New Science of Getting Older Without Getting Old",
    ],
    ["Author", "Title (Subtitle with spaces)", "Title", "Subtitle with spaces"],
    ["Author", "Title (Unabridged)", "Title (Unabridged)", ""],
    ["Author", "asdf)(", "asdf)(", ""],
  ])("should_split_title_correctly: %s / %s", (author, book, expectedTitle, expectedSubtitle) => {
    const [title, subtitle] = splitBookTitle(book, author);
    expect(title).toBe(expectedTitle);
    expect(subtitle).toBe(expectedSubtitle);
  });
});

describe("Parser.parseBookTitle: discography year ranges", () => {
  it.each<[string, number, number]>([
    ["Captain-Discography_1998_-_2001-CD-FLAC-2007-UTP", 1998, 2001],
    ["(Heavy Metal) Aria - Discography(46 CD) [1985 - 2015]", 1985, 2015],
    ["Led Zeppelin - Studio Discography 1969-1982 (10 books)(flac)", 1969, 1982],
    ["Minor Threat - Complete Discography [1989] [Anthology]", 0, 1989],
    ["Caetano Veloso Discografia Completa MP3 @256", 0, 0],
  ])("should_parse_year_or_year_range_from_discography: %s", (releaseTitle, startyear, endyear) => {
    const parseResult = parseBookTitle(releaseTitle);
    expect(parseResult?.discography).toBe(true);
    expect(parseResult?.discographyStart).toBe(startyear);
    expect(parseResult?.discographyEnd).toBe(endyear);
  });
});

describe("Parser.parseBookTitle: cleanup / crap handling", () => {
  it("should_clean_up_invalid_path_characters", () => {
    // Just verifying no exception is thrown.
    expect(() =>
      parseBookTitle("Discovery TV - Gold Rush : 02 Road From Hell [S04].mp4")
    ).not.toThrow();
  });
});

describe("Parser.parseReleaseGroup", () => {
  it.each<[string, string | null]>([
    ["Olafur.Arnalds-Remember-WEB-2018-ENTiTLED", "ENTiTLED"],
    ["[ www.Torrenting.com ] - Olafur.Arnalds-Remember-WEB-2018-ENTiTLED", "ENTiTLED"],
    ["Olafur.Arnalds-Remember-WEB-2018-ENTiTLED [eztv]-[rarbg.com]", "ENTiTLED"],
    ["7s-atlantis-128.mp3", null],
    ["Olafur.Arnalds-Remember-WEB-2018-ENTiTLED-Pre", "ENTiTLED"],
    ["Olafur.Arnalds-Remember-WEB-2018-ENTiTLED-postbot", "ENTiTLED"],
    ["Olafur.Arnalds-Remember-WEB-2018-ENTiTLED-xpost", "ENTiTLED"],
  ])("should_parse_release_group: %s -> %s", (title, expected) => {
    expect(parseReleaseGroup(title)).toBe(expected);
  });

  it.each<[string, string]>([
    ["Olafur.Arnalds-Remember-WEB-2018-SKGTV English", "SKGTV"],
    ["Olafur.Arnalds-Remember-WEB-2018-SKGTV_English", "SKGTV"],
    ["Olafur.Arnalds-Remember-WEB-2018-SKGTV.English", "SKGTV"],
  ])("should_not_include_language_in_release_group: %s -> %s", (title, expected) => {
    expect(parseReleaseGroup(title)).toBe(expected);
  });

  it.each<[string, string]>([
    ["Olafur.Arnalds-Remember-WEB-2018-EVL-RP", "EVL"],
    ["Olafur.Arnalds-Remember-WEB-2018-EVL-RP-RP", "EVL"],
    ["Olafur.Arnalds-Remember-WEB-2018-EVL-Obfuscated", "EVL"],
    ["Olafur.Arnalds-Remember-WEB-2018-xHD-NZBgeek", "xHD"],
    ["Olafur.Arnalds-Remember-WEB-2018-DIMENSION-NZBgeek", "DIMENSION"],
    ["Olafur.Arnalds-Remember-WEB-2018-xHD-1", "xHD"],
    ["Olafur.Arnalds-Remember-WEB-2018-DIMENSION-1", "DIMENSION"],
    ["Olafur.Arnalds-Remember-WEB-2018-EVL-Scrambled", "EVL"],
  ])("should_not_include_repost_in_release_group: %s -> %s", (title, expected) => {
    expect(parseReleaseGroup(title)).toBe(expected);
  });

  it.each<[string, string]>([
    ["[FFF] Invaders of the Rokujouma!! - S01E11 - Someday, With Them", "FFF"],
    ["[HorribleSubs] Invaders of the Rokujouma!! - S01E12 - Invasion Going Well!!", "HorribleSubs"],
    ["[Anime-Koi] Barakamon - S01E06 - Guys From Tokyo", "Anime-Koi"],
    ["[Anime-Koi] Barakamon - S01E07 - A High-Grade Fish", "Anime-Koi"],
    ["[Anime-Koi] Kami-sama Hajimemashita 2 - 01 [h264-720p][28D54E2C]", "Anime-Koi"],
  ])("should_parse_anime_release_groups: %s -> %s", (title, expected) => {
    expect(parseReleaseGroup(title)).toBe(expected);
  });
});

describe("Parser crap-title handling (CrapParserFixture.cs)", () => {
  it.each([
    "76El6LcgLzqb426WoVFg1vVVVGx4uCYopQkfjmLe",
    "Vrq6e1Aba3U amCjuEgV5R2QvdsLEGYF3YQAQkw8",
    "TDAsqTea7k4o6iofVx3MQGuDK116FSjPobMuh8oB",
    "yp4nFodAAzoeoRc467HRh1mzuT17qeekmuJ3zFnL",
    "oxXo8S2272KE1 lfppvxo3iwEJBrBmhlQVK1gqGc",
    "dPBAtu681Ycy3A4NpJDH6kNVQooLxqtnsW1Umfiv",
    'password - "bdc435cb-93c4-4902-97ea-ca00568c3887.337" yEnc',
    "185d86a343e39f3341e35c4dad3f9959",
    "ba27283b17c00d01193eacc02a8ba98eeb523a76",
    "45a55debe3856da318cc35882ad07e43cd32fd15",
    "86420f8ee425340d8894bf3bc636b66404b95f18",
    "ce39afb7da6cf7c04eba3090f0a309f609883862",
    "THIS SHOULD NEVER PARSE",
    "Vh1FvU3bJXw6zs8EEUX4bMo5vbbMdHghxHirc.mkv",
    "0e895c37245186812cb08aab1529cf8ee389dd05.mkv",
    "08bbc153931ce3ca5fcafe1b92d3297285feb061.mkv",
    "185d86a343e39f3341e35c4dad3ff159",
    "ah63jka93jf0jh26ahjas961.mkv",
    "qrdSD3rYzWb7cPdVIGSn4E7",
    "QZC4HDl7ncmzyUj9amucWe1ddKU1oFMZDd8r0dEDUsTd",
  ])("should_not_parse_crap: %s", (title) => {
    expect(parseBookTitle(title)).toBeNull();
  });

  it("should_not_parse_file_name_without_proper_spacing", () => {
    expect(parseBookTitle("thebiggestloser1618finale")).toBeNull();
  });

  it("should_not_parse_md5 (repeated MD5 chain, ported from CrapParserFixture.should_not_parse_md5)", () => {
    let hash = "CRAPPY TEST SEED";
    let success = 0;
    const repetitions = 100;
    for (let i = 0; i < repetitions; i++) {
      hash = createHash("md5").update(hash, "latin1").digest("hex").toUpperCase();
      if (parseBookTitle(hash) === null) {
        success++;
      }
    }
    expect(success).toBe(repetitions);
  });
});

describe("Parser.parseTitle (ReportMusicTitleRegex) smoke test", () => {
  it("returns a ParsedTrackInfo with an author for a simple track title", () => {
    const result = parseTitle("01 - Some Author - Some Track");
    expect(result).not.toBeNull();
  });

  it("returns null for crap/hashed titles", () => {
    expect(parseTitle("76El6LcgLzqb426WoVFg1vVVVGx4uCYopQkfjmLe")).toBeNull();
  });
});

describe("Quality import sanity", () => {
  it("Quality.MP3 exists (used indirectly by ParserFixture-derived tests)", () => {
    expect(Quality.MP3.name).toBe("MP3");
  });
});
