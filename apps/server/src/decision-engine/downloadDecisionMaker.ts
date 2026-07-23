import { qualityFromId } from "../qualities/quality.js";
import { calculateCustomFormatScore } from "../profiles/qualities/qualityProfile.js";
import { DownloadDecision } from "./downloadDecision.js";
import { Rejection } from "./rejection.js";
import {
  ReleaseSourceType,
  type ParsedBookInfo,
  type ReleaseInfo,
  type RemoteBook,
  type SearchCriteriaBase,
} from "./remoteBook.js";
import type { CustomFormatCalculationServiceLike } from "./mediaFile.js";
import type { IDecisionEngineSpecification } from "./specifications/decisionEngineSpecification.js";
import { SpecificationPriority } from "./specificationPriority.js";

/**
 * Forward-ref for the slice of NzbDrone.Core/Parser/Parser.cs's static
 * `ParseBookTitle`/`ParseBookTitleWithSearchCriteria` methods this
 * orchestrator calls (module not ported yet -- Parser is a sibling Phase 2
 * worktree). C#'s `Parser.Parser` is a static class with static parsing
 * methods; ported here as an injected object implementing the same two
 * entry points, since this port has no static-class equivalent and the
 * caller (whoever wires up the real DownloadDecisionMaker once Parser
 * lands) needs to supply the real implementation anyway.
 */
export interface BookTitleParserLike {
  parseBookTitle(title: string): ParsedBookInfo | null;
  parseBookTitleWithSearchCriteria(
    title: string,
    author: RemoteBook["author"],
    books: RemoteBook["books"]
  ): ParsedBookInfo | null;
}

/**
 * Forward-ref for the slice of NzbDrone.Core/Parser/ParsingService.cs
 * (`IParsingService`) this orchestrator calls.
 */
export interface ParsingServiceLike {
  parseBookTitleFuzzy(title: string): ParsedBookInfo | null;
  map(parsedBookInfo: ParsedBookInfo, searchCriteria: SearchCriteriaBase | null): RemoteBook;
}

/**
 * Forward-ref for NzbDrone.Core/Download/Aggregation/IRemoteBookAggregationService.cs
 * (module not ported yet -- Download is Phase 3).
 */
export interface RemoteBookAggregationServiceLike {
  augment(remoteBook: RemoteBook): void;
}

/**
 * Forward-ref for the slice of NzbDrone.Core/Parser/QualityParser.cs this
 * orchestrator calls, to re-parse quality from title+categories when the
 * first pass came back Unknown.
 */
export interface QualityParserLike {
  parseQuality(
    title: string,
    subtitle: string | null,
    categories: number[] | undefined
  ): ParsedBookInfo["quality"];
}

/** Ported from NzbDrone.Core/DecisionEngine/DownloadDecisionMaker.cs's `IMakeDownloadDecision`. */
export interface IMakeDownloadDecision {
  getRssDecision(reports: ReleaseInfo[], pushedRelease?: boolean): DownloadDecision[];
  getSearchDecision(reports: ReleaseInfo[], searchCriteria: SearchCriteriaBase): DownloadDecision[];
}

/**
 * Ported from NzbDrone.Core/DecisionEngine/DownloadDecisionMaker.cs.
 *
 * DEVIATION (explicit-over-reflection, per this project's established
 * pattern -- see PORT_PLAN.md / the Datastore module notes referenced in
 * this module's task brief): C#'s DI container discovers every
 * `IDecisionEngineSpecification` implementation via reflection/assembly
 * scanning and injects the full set into this class's constructor
 * (`IEnumerable<IDecisionEngineSpecification> specifications`). This port
 * takes an explicit `IDecisionEngineSpecification[]` instead -- callers
 * build that array themselves (see `createDefaultSpecifications()` below
 * for the full, explicit list mirroring every real spec under
 * `specifications/`), rather than this class doing any scanning/discovery
 * of its own.
 *
 * NLog `_logger` calls from the C# source (ProgressInfo/ProgressTrace/Debug/
 * Error) are omitted rather than routed anywhere, matching this repo's
 * established convention elsewhere (Instrumentation isn't ported yet --
 * Phase 4 -- and nothing here needs logging to behave correctly).
 */
export class DownloadDecisionMaker implements IMakeDownloadDecision {
  constructor(
    private readonly specifications: IDecisionEngineSpecification[],
    private readonly parsingService: ParsingServiceLike,
    private readonly formatCalculator: CustomFormatCalculationServiceLike,
    private readonly aggregationService: RemoteBookAggregationServiceLike,
    private readonly bookTitleParser: BookTitleParserLike,
    private readonly qualityParser: QualityParserLike
  ) {}

  getRssDecision(reports: ReleaseInfo[], pushedRelease = false): DownloadDecision[] {
    return this.getBookDecisions(reports, pushedRelease, null);
  }

  getSearchDecision(
    reports: ReleaseInfo[],
    searchCriteria: SearchCriteriaBase
  ): DownloadDecision[] {
    return this.getBookDecisions(reports, false, searchCriteria);
  }

  private getBookDecisions(
    reports: ReleaseInfo[],
    pushedRelease: boolean,
    searchCriteria: SearchCriteriaBase | null
  ): DownloadDecision[] {
    const results: DownloadDecision[] = [];

    for (const report of reports) {
      let decision: DownloadDecision | null = null;

      try {
        let parsedBookInfo = this.bookTitleParser.parseBookTitle(report.title);

        if (parsedBookInfo == null) {
          if (searchCriteria != null) {
            parsedBookInfo = this.bookTitleParser.parseBookTitleWithSearchCriteria(
              report.title,
              searchCriteria.author,
              searchCriteria.books
            );
          } else {
            // try parsing fuzzy
            parsedBookInfo = this.parsingService.parseBookTitleFuzzy(report.title);
          }
        }

        if (
          parsedBookInfo != null &&
          parsedBookInfo.authorName != null &&
          parsedBookInfo.authorName.trim() !== ""
        ) {
          let remoteBook = this.parsingService.map(parsedBookInfo, searchCriteria);
          remoteBook.release = report;

          this.aggregationService.augment(remoteBook);

          // try parsing again using the search criteria, in case it parsed but parsed incorrectly
          if (
            (remoteBook.author == null || remoteBook.books.length === 0) &&
            searchCriteria != null
          ) {
            const parsedBookInfoWithCriteria =
              this.bookTitleParser.parseBookTitleWithSearchCriteria(
                report.title,
                searchCriteria.author,
                searchCriteria.books
              );

            if (
              parsedBookInfoWithCriteria != null &&
              parsedBookInfoWithCriteria.authorName?.trim()
            ) {
              remoteBook = this.parsingService.map(parsedBookInfoWithCriteria, searchCriteria);
            }
          }

          remoteBook.release = report;

          // parse quality again with title and category if unknown
          if (remoteBook.parsedBookInfo.quality.quality.id === qualityFromId(0).id) {
            remoteBook.parsedBookInfo.quality = this.qualityParser.parseQuality(
              report.title,
              null,
              report.categories
            );
          }

          if (remoteBook.author == null) {
            decision = new DownloadDecision(remoteBook, new Rejection("Unknown Author"));

            // shove in the searched author in case of forced download in interactive search
            if (searchCriteria != null) {
              remoteBook.author = searchCriteria.author;
              remoteBook.books = searchCriteria.books;
            }
          } else if (remoteBook.books.length === 0) {
            decision = new DownloadDecision(
              remoteBook,
              new Rejection("Unable to parse books from release name")
            );
            if (searchCriteria != null) {
              remoteBook.books = searchCriteria.books;
            }
          } else {
            this.aggregationService.augment(remoteBook);

            remoteBook.customFormats = this.formatCalculator.parseCustomFormatForRemoteBook(
              remoteBook,
              remoteBook.release.size
            );
            remoteBook.customFormatScore = remoteBook.author?.qualityProfile
              ? calculateCustomFormatScore(
                  remoteBook.author.qualityProfile,
                  remoteBook.customFormats
                )
              : 0;

            remoteBook.downloadAllowed = remoteBook.books.length > 0;
            decision = this.getDecisionForReport(remoteBook, searchCriteria);
          }
        }

        if (searchCriteria != null) {
          if (parsedBookInfo == null) {
            parsedBookInfo = {
              authorName: "",
              quality: this.qualityParser.parseQuality(report.title, null, report.categories),
              discography: false,
            };
          }

          if (!parsedBookInfo.authorName || parsedBookInfo.authorName.trim() === "") {
            const remoteBook: RemoteBook = {
              release: report,
              parsedBookInfo,
              author: undefined as unknown as RemoteBook["author"],
              books: [],
              downloadAllowed: false,
              customFormats: [],
              customFormatScore: 0,
              releaseSource: ReleaseSourceType.Unknown,
            };

            decision = new DownloadDecision(remoteBook, new Rejection("Unable to parse release"));
          }
        }
      } catch {
        const remoteBook: RemoteBook = {
          release: report,
          parsedBookInfo: undefined as unknown as ParsedBookInfo,
          author: undefined as unknown as RemoteBook["author"],
          books: [],
          downloadAllowed: false,
          customFormats: [],
          customFormatScore: 0,
          releaseSource: ReleaseSourceType.Unknown,
        };
        decision = new DownloadDecision(
          remoteBook,
          new Rejection("Unexpected error processing release")
        );
      }

      if (decision != null) {
        let source = pushedRelease ? ReleaseSourceType.ReleasePush : ReleaseSourceType.Rss;

        if (searchCriteria != null) {
          if (searchCriteria.interactiveSearch) {
            source = ReleaseSourceType.InteractiveSearch;
          } else if (searchCriteria.userInvokedSearch) {
            source = ReleaseSourceType.UserInvokedSearch;
          } else {
            source = ReleaseSourceType.Search;
          }
        }

        (decision.remoteBook as { releaseSource: ReleaseSourceType }).releaseSource = source;

        results.push(decision);
      }
    }

    return results;
  }

  private getDecisionForReport(
    remoteBook: RemoteBook,
    searchCriteria: SearchCriteriaBase | null
  ): DownloadDecision {
    let reasons: Rejection[] = [];

    const byPriority = new Map<SpecificationPriority, IDecisionEngineSpecification[]>();
    for (const spec of this.specifications) {
      const group = byPriority.get(spec.priority);
      if (group) {
        group.push(spec);
      } else {
        byPriority.set(spec.priority, [spec]);
      }
    }

    const orderedPriorities = [...byPriority.keys()].sort((a, b) => a - b);

    for (const priority of orderedPriorities) {
      const specs = byPriority.get(priority);
      if (!specs) {
        continue;
      }

      reasons = specs
        .map((spec) => this.evaluateSpec(spec, remoteBook, searchCriteria))
        .filter((r): r is Rejection => r != null);

      if (reasons.length > 0) {
        break;
      }
    }

    return new DownloadDecision(remoteBook, ...reasons);
  }

  private evaluateSpec(
    spec: IDecisionEngineSpecification,
    remoteBook: RemoteBook,
    searchCriteria: SearchCriteriaBase | null
  ): Rejection | null {
    try {
      const result = spec.isSatisfiedBy(remoteBook, searchCriteria);

      if (!result.accepted) {
        return new Rejection(result.reason ?? "", spec.type);
      }
    } catch (e) {
      return new Rejection(
        `${spec.constructor.name}: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    return null;
  }
}
