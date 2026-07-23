import { describe, expect, it, vi } from "vitest";
import {
  DownloadDecisionMaker,
  type BookTitleParserLike,
  type ParsingServiceLike,
  type QualityParserLike,
  type RemoteBookAggregationServiceLike,
} from "../downloadDecisionMaker.js";
import { Decision } from "../decision.js";
import type { IDecisionEngineSpecification } from "../specifications/decisionEngineSpecification.js";
import { RejectionType } from "../rejectionType.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { CustomFormatCalculationServiceLike } from "../mediaFile.js";
import {
  newRemoteBook,
  ReleaseSourceType,
  type ParsedBookInfo,
  type ReleaseInfo,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../remoteBook.js";
import { Quality } from "../../qualities/quality.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { makeAuthor, makeBook, makeReleaseInfo, makeRemoteBook } from "./testFixtures.js";

/**
 * Ported from NzbDrone.Core.Test/DecisionEngineTests/DownloadDecisionMakerFixture.cs.
 *
 * DEVIATION: the real C# fixture relies on `Parser.Parser.ParseBookTitle`
 * (a real static parsing method from the not-yet-ported Parser module,
 * see PORT_PLAN.md Phase 2) actually parsing release titles like
 * "Coldplay-A Head Full Of Dreams-CD-FLAC-2015-PERFECT" into
 * `AuthorName`/`BookTitle`. This port's `DownloadDecisionMaker` takes that
 * parser as an injected `BookTitleParserLike` forward-ref instead (see
 * downloadDecisionMaker.ts's header comment), so these tests drive that seam
 * directly -- returning a real-looking `ParsedBookInfo` for "parsable"
 * titles and `null` for "not parsable" ones -- rather than depending on
 * real title-parsing heuristics that don't exist in this repo yet. The
 * observable behavior under test (which specs get called, in what order,
 * with what results) is preserved exactly.
 */
describe("DownloadDecisionMaker", () => {
  const parsableTitle = "Coldplay-A Head Full Of Dreams-CD-FLAC-2015-PERFECT";

  function makeSpec(
    name: string,
    decision: Decision,
    priority = SpecificationPriority.Default
  ): IDecisionEngineSpecification {
    return {
      priority,
      type: RejectionType.Permanent,
      isSatisfiedBy: vi.fn(() => decision),
    };
  }

  function makeParsedBookInfo(): ParsedBookInfo {
    return {
      authorName: "Coldplay",
      bookTitle: "A Head Full Of Dreams",
      quality: newQualityModel(Quality.FLAC),
      discography: false,
    };
  }

  function makeSubject(opts: {
    specifications: IDecisionEngineSpecification[];
    remoteBook?: RemoteBook | null;
    bookTitleParser?: Partial<BookTitleParserLike>;
    parsingService?: Partial<ParsingServiceLike>;
    mapThrows?: boolean;
  }) {
    const remoteBook =
      opts.remoteBook !== undefined
        ? opts.remoteBook
        : makeRemoteBook({ books: [makeBook({ id: 1 })] });

    const bookTitleParser: BookTitleParserLike = {
      parseBookTitle: vi.fn((title: string) =>
        title === parsableTitle ? makeParsedBookInfo() : null
      ),
      parseBookTitleWithSearchCriteria: vi.fn(() => null),
      ...opts.bookTitleParser,
    };

    const mapFn = opts.mapThrows
      ? vi.fn(() => {
          throw new Error("Test exception");
        })
      : vi.fn(() => remoteBook as RemoteBook);

    const parsingService: ParsingServiceLike = {
      parseBookTitleFuzzy: vi.fn(() => null),
      map: mapFn,
      ...opts.parsingService,
    };

    const formatCalculator: CustomFormatCalculationServiceLike = {
      parseCustomFormatForRemoteBook: vi.fn(() => []),
      parseCustomFormatForFile: vi.fn(() => []),
      parseCustomFormatForHistory: vi.fn(() => []),
    };

    const aggregationService: RemoteBookAggregationServiceLike = { augment: vi.fn() };

    const qualityParser: QualityParserLike = {
      parseQuality: vi.fn(() => newQualityModel(Quality.Unknown)),
    };

    const maker = new DownloadDecisionMaker(
      opts.specifications,
      parsingService,
      formatCalculator,
      aggregationService,
      bookTitleParser,
      qualityParser
    );

    return { maker, bookTitleParser, parsingService, remoteBook };
  }

  function reportsWithTitle(title: string): ReleaseInfo[] {
    return [makeReleaseInfo({ title })];
  }

  it("should_call_all_specifications", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const pass2 = makeSpec("pass2", Decision.accept());
    const pass3 = makeSpec("pass3", Decision.accept());
    const fail1 = makeSpec("fail1", Decision.reject("fail1"));
    const fail2 = makeSpec("fail2", Decision.reject("fail2"));
    const fail3 = makeSpec("fail3", Decision.reject("fail3"));

    const { maker } = makeSubject({ specifications: [pass1, pass2, pass3, fail1, fail2, fail3] });
    maker.getRssDecision(reportsWithTitle(parsableTitle));

    for (const spec of [pass1, pass2, pass3, fail1, fail2, fail3]) {
      expect(spec.isSatisfiedBy).toHaveBeenCalledTimes(1);
    }
  });

  it("should_call_delayed_specifications_if_non_delayed_passed", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const failDelayed1 = makeSpec(
      "failDelayed1",
      Decision.reject("failDelayed1"),
      SpecificationPriority.Disk
    );

    const { maker } = makeSubject({ specifications: [pass1, failDelayed1] });
    maker.getRssDecision(reportsWithTitle(parsableTitle));

    expect(failDelayed1.isSatisfiedBy).toHaveBeenCalledTimes(1);
  });

  it("should_not_call_delayed_specifications_if_non_delayed_failed", () => {
    const fail1 = makeSpec("fail1", Decision.reject("fail1"));
    const failDelayed1 = makeSpec(
      "failDelayed1",
      Decision.reject("failDelayed1"),
      SpecificationPriority.Disk
    );

    const { maker } = makeSubject({ specifications: [fail1, failDelayed1] });
    maker.getRssDecision(reportsWithTitle(parsableTitle));

    expect(failDelayed1.isSatisfiedBy).not.toHaveBeenCalled();
  });

  it("should_return_rejected_if_single_specs_fail", () => {
    const fail1 = makeSpec("fail1", Decision.reject("fail1"));
    const { maker } = makeSubject({ specifications: [fail1] });

    const result = maker.getRssDecision(reportsWithTitle(parsableTitle));
    expect(result).toHaveLength(1);
    expect(result[0]!.approved).toBe(false);
  });

  it("should_return_pass_if_all_specs_pass", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const pass2 = makeSpec("pass2", Decision.accept());
    const pass3 = makeSpec("pass3", Decision.accept());
    const { maker } = makeSubject({ specifications: [pass1, pass2, pass3] });

    const result = maker.getRssDecision(reportsWithTitle(parsableTitle));
    expect(result[0]!.approved).toBe(true);
  });

  it("should_have_same_number_of_rejections_as_specs_that_failed", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const pass2 = makeSpec("pass2", Decision.accept());
    const pass3 = makeSpec("pass3", Decision.accept());
    const fail1 = makeSpec("fail1", Decision.reject("fail1"));
    const fail2 = makeSpec("fail2", Decision.reject("fail2"));
    const fail3 = makeSpec("fail3", Decision.reject("fail3"));

    const { maker } = makeSubject({ specifications: [pass1, pass2, pass3, fail1, fail2, fail3] });
    const result = maker.getRssDecision(reportsWithTitle(parsableTitle));

    expect(result[0]!.rejections).toHaveLength(3);
  });

  it("should_not_attempt_to_map_book_if_not_parsable", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const { maker, parsingService } = makeSubject({ specifications: [pass1] });

    maker.getRssDecision(reportsWithTitle("Not parsable"));

    expect(parsingService.map).not.toHaveBeenCalled();
    expect(pass1.isSatisfiedBy).not.toHaveBeenCalled();
  });

  it("should_not_attempt_to_make_decision_if_author_is_unknown", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const remoteBookNoAuthor = makeRemoteBook({
      author: undefined as unknown as ReturnType<typeof makeAuthor>,
    });
    const { maker } = makeSubject({ specifications: [pass1], remoteBook: remoteBookNoAuthor });

    maker.getRssDecision(reportsWithTitle(parsableTitle));

    expect(pass1.isSatisfiedBy).not.toHaveBeenCalled();
  });

  it("should_return_unknown_author_rejection_if_author_is_unknown", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const remoteBookNoAuthor = makeRemoteBook({
      author: undefined as unknown as ReturnType<typeof makeAuthor>,
    });
    const { maker } = makeSubject({ specifications: [pass1], remoteBook: remoteBookNoAuthor });

    const result = maker.getRssDecision(reportsWithTitle(parsableTitle));
    expect(result).toHaveLength(1);
    expect(result[0]!.rejections.some((r) => r.reason === "Unknown Author")).toBe(true);
  });

  it("should_not_allow_download_if_author_is_unknown", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    // Uses newRemoteBook() (downloadAllowed defaults to false, matching C#'s
    // bare `new RemoteBook()` constructor -- see remoteBook.ts) rather than
    // this test file's makeRemoteBook() helper (which defaults
    // downloadAllowed to true for the convenience of specification tests
    // that don't exercise this orchestrator branch): the "Author is
    // unknown" path in DownloadDecisionMaker never sets DownloadAllowed
    // itself, so the constructor default is what's actually observed here.
    const remoteBookNoAuthor = newRemoteBook({
      author: undefined as unknown as ReturnType<typeof makeAuthor>,
    });
    const { maker } = makeSubject({ specifications: [pass1], remoteBook: remoteBookNoAuthor });

    const result = maker.getRssDecision(reportsWithTitle(parsableTitle));
    expect(result[0]!.remoteBook.downloadAllowed).toBe(false);
  });

  it("should_not_allow_download_if_no_books_found", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    // Same newRemoteBook() reasoning as the "author is unknown" test above --
    // the "Unable to parse books" branch never sets DownloadAllowed either.
    const remoteBookNoBooks = newRemoteBook({ author: makeAuthor(), books: [] });
    const { maker } = makeSubject({ specifications: [pass1], remoteBook: remoteBookNoBooks });

    const result = maker.getRssDecision(reportsWithTitle(parsableTitle));
    expect(result).toHaveLength(1);
    expect(result[0]!.remoteBook.downloadAllowed).toBe(false);
  });

  it("broken_report_shouldnt_blowup_the_process", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const { maker } = makeSubject({ specifications: [pass1], mapThrows: true });

    const reports = [
      makeReleaseInfo({ title: parsableTitle }),
      makeReleaseInfo({ title: parsableTitle }),
      makeReleaseInfo({ title: parsableTitle }),
    ];

    expect(() => maker.getRssDecision(reports)).not.toThrow();
    const result = maker.getRssDecision(reports);
    expect(result).toHaveLength(3);
    expect(
      result.every((d) =>
        d.rejections.some((r) => r.reason === "Unexpected error processing release")
      )
    ).toBe(true);
  });

  it("should_return_a_decision_when_exception_is_caught", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const { maker } = makeSubject({ specifications: [pass1], mapThrows: true });

    const result = maker.getRssDecision([makeReleaseInfo({ title: parsableTitle })]);
    expect(result).toHaveLength(1);
  });

  it("assigns ReleaseSourceType.Rss for a plain RSS decision, and Search/UserInvokedSearch/InteractiveSearch per search criteria flags", () => {
    const pass1 = makeSpec("pass1", Decision.accept());
    const { maker } = makeSubject({ specifications: [pass1] });

    const rssResult = maker.getRssDecision(reportsWithTitle(parsableTitle));
    expect(rssResult[0]!.remoteBook.releaseSource).toBe(ReleaseSourceType.Rss);

    const pushedResult = maker.getRssDecision(reportsWithTitle(parsableTitle), true);
    expect(pushedResult[0]!.remoteBook.releaseSource).toBe(ReleaseSourceType.ReleasePush);

    const searchCriteria: SearchCriteriaBase = {
      kind: "author",
      monitoredBooksOnly: false,
      userInvokedSearch: true,
      interactiveSearch: false,
      author: makeAuthor(),
      books: [],
    };
    const searchResult = maker.getSearchDecision(reportsWithTitle(parsableTitle), searchCriteria);
    expect(searchResult[0]!.remoteBook.releaseSource).toBe(ReleaseSourceType.UserInvokedSearch);
  });
});
