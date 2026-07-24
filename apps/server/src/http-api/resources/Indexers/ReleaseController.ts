import { Router, type Request, type Response } from "express";
import type { Author } from "../../../books/models.js";
import type { AuthorService } from "../../../books/authorService.js";
import type { BookService } from "../../../books/bookService.js";
import { DownloadDecision } from "../../../decision-engine/index.js";
import type { AuthorWithQualityProfile, RemoteBook } from "../../../decision-engine/remoteBook.js";
import type { IFetchAndParseRss } from "../../../indexers/FetchAndParseRssService.js";
import type { ISearchForReleases } from "../../../indexer-search/releaseSearchService.js";
import type { DownloadDecision as IndexerSearchDownloadDecision } from "../../../indexer-search/collaborators.js";
import type { IPrioritizeDownloadDecision } from "../../../decision-engine/downloadDecisionPrioritizationService.js";
import type { ParsingService } from "../../../parser/parsingService.js";
import type { ParsedBookInfo } from "../../../parser/model/parsedBookInfo.js";
import { NzbDroneClientException } from "../../../exceptions/NzbDroneClientException.js";
import { requestPath, validateResource } from "../../rest/RestController.js";
import { noopValidator, type ResourceValidator } from "../../rest/ResourceValidator.js";
import { mapDecision, mapDecisions } from "./ReleaseModuleBase.js";
import type { ReleaseResource } from "./ReleaseResource.js";

/**
 * Ported from Readarr.Api.V1/Indexers/ReleaseController.cs.
 *
 * ## Forward-referenced collaborators
 *
 * `IDownloadService`/`DownloadReport` (`NzbDrone.Core.Download`) isn't a
 * ported module in this worktree's scope (Download is a later phase, not
 * one of the 9 sibling groups per this task's brief) -- narrowed here to
 * `IDownloadServiceLike.downloadReport(remoteBook, downloadClientId)`,
 * matching the same forward-reference pattern `indexer-search/
 * collaborators.ts` already established for sibling not-yet-ported
 * dependencies of this exact module family.
 *
 * `ReleaseDownloadException` (`NzbDrone.Core.Exceptions`) similarly isn't
 * ported -- the real controller catches it specifically to translate into a
 * 409 `NzbDroneClientException`. Ported as a plain `instanceof Error` check
 * against a locally-declared marker class a real `IDownloadServiceLike`
 * implementation can throw; any other thrown error propagates to Express's
 * error pipeline unmodified (matching the real source's `catch
 * (ReleaseDownloadException ex)` -- only that specific exception type is
 * caught, everything else bubbles up as an unhandled 500 via the base MVC
 * pipeline, exactly what letting it fall through to `next(err)` reproduces
 * here).
 *
 * ## `_remoteBookCache`
 *
 * Ported from the ctor's `cacheManager.GetCache<RemoteBook>(GetType(),
 * "remoteBooks")` (`ICacheManager`/`ICached<T>`, NzbDrone.Common.Cache) --
 * no generic cache-manager module exists in this port yet, so a small local
 * TTL map (`RemoteBookCache` below) stands in, matching the same "find(key)
 * -> value-or-undefined, set(key, value, ttlMs)" surface `ICached<T>.Find`/
 * `.Set` expose. 30-minute TTL preserved from `TimeSpan.FromMinutes(30)`.
 *
 * ## `Author.QualityProfile` (`LazyLoaded<T>`) gap
 *
 * `decision-engine/remoteBook.ts`'s `RemoteBook.author` is typed
 * `AuthorWithQualityProfile` (real `Author` widened with a resolved
 * `qualityProfile` field a caller is expected to have populated -- see that
 * module's own doc comment). The real C# `Author.QualityProfile` is a
 * `LazyLoaded<QualityProfile>` that transparently resolves on `.Value`
 * access; this port's `books/authorService.ts` `AuthorService.getAuthor`/
 * `.getAuthorByMetadataId` return the plain `Author` with no such
 * resolution (matching `books/models.ts`'s documented "LazyLoaded fields
 * are plain optional properties a caller populates explicitly" convention).
 * `asAuthorWithQualityProfile()` below documents this gap at the one place
 * it matters for this controller (assigning a freshly-looked-up `Author`
 * onto `RemoteBook.author`, which structurally requires the wider type) --
 * a real deployment wiring this controller together needs to inject an
 * `AuthorService`/lookup that resolves `qualityProfile` (e.g. by joining
 * `profiles/qualities/qualityProfileService.ts`), which is a real,
 * already-ported module in this codebase but outside this task's own file
 * scope to wire up here.
 */
function asAuthorWithQualityProfile(author: Author): AuthorWithQualityProfile {
  return author as AuthorWithQualityProfile;
}

/**
 * `indexer-search/releaseSearchService.ts`'s `ISearchForReleases.bookSearch`/
 * `.authorSearch` return `indexer-search/collaborators.ts`'s own local
 * `DownloadDecision` -- documented there as "a structural forward-reference
 * type" for `NzbDrone.Core/DecisionEngine/DownloadDecision.cs`, a plain
 * data interface (`{ remoteBook, rejections }`) with `approved`/
 * `temporarilyRejected`/`rejected` exposed as free FUNCTIONS
 * (`isApproved(decision)` etc.) rather than instance getters, since
 * IndexerSearch was ported before DecisionEngine's real class landed.
 * `IPrioritizeDownloadDecision.prioritizeDecisions` (the REAL, later-ported
 * `decision-engine/downloadDecisionPrioritizationService.ts`) expects the
 * REAL `DownloadDecision` class (getters, not functions) -- this adapter
 * re-wraps each plain result in a real `DownloadDecision` instance so the
 * two independently-ported modules' shapes reconcile at this one call
 * boundary, without editing either already-merged module.
 */
function toRealDownloadDecisions(decisions: IndexerSearchDownloadDecision[]): DownloadDecision[] {
  return decisions.map(
    (d) => new DownloadDecision(d.remoteBook as unknown as RemoteBook, ...(d.rejections as never[]))
  );
}

/**
 * `decision-engine/remoteBook.ts` and `parser/model/parsedBookInfo.ts` each
 * independently forward-referenced/ported their own `ParsedBookInfo` shape
 * before the other module existed (decision-engine's copy is documented as
 * "narrowed to the fields DecisionEngine's real C# source actually
 * reads/writes" -- it's missing `authorTitleInfo`, which no DecisionEngine
 * specification reads, but `ParsingService.GetBooks`'s real C# source
 * doesn't read it either -- it only touches `BookTitle`/`Discography`/
 * `DiscographyStart`/`DiscographyEnd`, all present on both shapes). A real
 * `RemoteBook.parsedBookInfo` flowing out of `DownloadDecisionMaker`
 * (decision-engine) into this controller's own `parsingService.getBooks()`
 * call (parser module) is therefore always structurally compatible at
 * runtime -- this cast documents that fact instead of requiring the two
 * already-merged modules' independent `ParsedBookInfo` copies to be
 * reconciled (out of this task's file-ownership scope).
 */
function asParserParsedBookInfo(info: unknown): ParsedBookInfo {
  return info as ParsedBookInfo;
}

export interface IDownloadServiceLike {
  downloadReport(remoteBook: RemoteBook, downloadClientId?: number): Promise<void>;
}

/** Marker class a real `IDownloadServiceLike.downloadReport` implementation should throw to get the real source's 409 translation -- see this module's doc comment. */
export class ReleaseDownloadException extends Error {}

/** Ported from `ICacheManager.GetCache<RemoteBook>(...)`/`ICached<RemoteBook>` -- see this module's doc comment. */
class RemoteBookCache {
  private readonly store = new Map<string, { value: RemoteBook; expiresAt: number }>();

  find(key: string): RemoteBook | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: RemoteBook, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

const REMOTE_BOOK_CACHE_TTL_MS = 30 * 60 * 1000;

/** Ported from `ReleaseController`'s ctor `PostValidator.RuleFor(s => s.IndexerId).ValidId(); PostValidator.RuleFor(s => s.Guid).NotEmpty();`. */
const postValidator: ResourceValidator<ReleaseResource> = (release) => {
  const failures: ReturnType<ResourceValidator<ReleaseResource>> = [];

  if (!(Number.isInteger(release.indexerId) && release.indexerId > 0)) {
    failures.push({ propertyName: "indexerId", errorMessage: "'Indexer Id' must be a valid id" });
  }

  if (!release.guid || release.guid.trim() === "") {
    failures.push({ propertyName: "guid", errorMessage: "'Guid' must not be empty." });
  }

  return failures;
};

/** Ported from `ReleaseController.GetCacheKey(ReleaseResource resource)`: `string.Concat(resource.IndexerId, "_", resource.Guid)`. */
function getCacheKey(resource: { indexerId: number; guid: string }): string {
  return `${resource.indexerId}_${resource.guid}`;
}

export interface ReleaseControllerOptions {
  rssFetcherAndParser: IFetchAndParseRss;
  releaseSearchService: ISearchForReleases;
  downloadDecisionMaker: { getRssDecision(reports: unknown[]): DownloadDecision[] };
  prioritizeDownloadDecision: IPrioritizeDownloadDecision;
  downloadService: IDownloadServiceLike;
  authorService: AuthorService;
  bookService: BookService;
  parsingService: ParsingService;
}

/**
 * Builds the `ReleaseController` Express router (`GET /`, `POST /` -- the
 * manual-search/grab release-list endpoints).
 */
export function releaseController(options: ReleaseControllerOptions): Router {
  const {
    rssFetcherAndParser,
    releaseSearchService,
    downloadDecisionMaker,
    prioritizeDownloadDecision,
    downloadService,
    authorService,
    bookService,
    parsingService,
  } = options;

  const remoteBookCache = new RemoteBookCache();

  /** Ported from `ReleaseController.MapDecision` override: base mapping + cache-set side effect. */
  function mapDecisionWithCache(
    decision: DownloadDecision,
    initialWeight: number
  ): ReleaseResource {
    const resource = mapDecision(decision, initialWeight);
    remoteBookCache.set(getCacheKey(resource), decision.remoteBook, REMOTE_BOOK_CACHE_TTL_MS);
    return resource;
  }

  function mapDecisionsWithCache(decisions: Iterable<DownloadDecision>): ReleaseResource[] {
    const result: ReleaseResource[] = [];
    for (const decision of decisions) {
      result.push(mapDecisionWithCache(decision, result.length));
    }
    return result;
  }

  const router = Router();

  // ---- POST / (DownloadRelease) ----------------------------------------------
  router.post("/", (req: Request, res: Response, next) => {
    void (async () => {
      try {
        const release = req.body as ReleaseResource;

        validateResource(release, "POST", requestPath(req), {
          sharedValidator: noopValidator<ReleaseResource>(),
          postValidator,
          putValidator: noopValidator<ReleaseResource>(),
        });

        const remoteBook = remoteBookCache.find(getCacheKey(release));

        if (!remoteBook) {
          throw new NzbDroneClientException(
            404,
            "Couldn't find requested release in cache, try searching again"
          );
        }

        try {
          if (!remoteBook.author) {
            if (release.bookId) {
              const book = bookService.getBook(release.bookId);
              // C#: `_authorService.GetAuthor(book.AuthorId)`, where
              // `Book.AuthorId` is a compatibility getter proxying
              // `Author.Value.Id` -- not ported onto this port's `Book`
              // (see books/models.ts's doc comment) -- resolved here via
              // `authorMetadataId` instead, the same substitute
              // `indexer-search/releaseSearchService.ts`'s own
              // `bookSearchForBook` already uses for the identical lookup.
              const author = authorService.getAuthorByMetadataId(book.authorMetadataId);
              if (!author) {
                throw new NzbDroneClientException(404, "Unable to find matching author and books");
              }
              remoteBook.author = asAuthorWithQualityProfile(author);
              remoteBook.books = [book];
            } else if (release.authorId) {
              const author = authorService.getAuthor(release.authorId);
              const books = parsingService.getBooks(
                asParserParsedBookInfo(remoteBook.parsedBookInfo),
                author
              );

              if (books.length === 0) {
                throw new NzbDroneClientException(404, "Unable to parse books in the release");
              }

              remoteBook.author = asAuthorWithQualityProfile(author);
              remoteBook.books = books;
            } else {
              throw new NzbDroneClientException(404, "Unable to find matching author and books");
            }
          } else if (remoteBook.books.length === 0) {
            let books = parsingService.getBooks(
              asParserParsedBookInfo(remoteBook.parsedBookInfo),
              remoteBook.author
            );

            if (books.length === 0 && release.bookId) {
              books = [bookService.getBook(release.bookId)];
            }

            remoteBook.books = books;
          }

          if (remoteBook.books.length === 0) {
            throw new NzbDroneClientException(404, "Unable to parse books in the release");
          }

          await downloadService.downloadReport(remoteBook, release.downloadClientId);
        } catch (ex) {
          if (ex instanceof ReleaseDownloadException) {
            throw new NzbDroneClientException(409, "Getting release from indexer failed");
          }
          throw ex;
        }

        res.json(release);
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- GET / (GetReleases) ---------------------------------------------------
  router.get("/", (req: Request, res: Response, next) => {
    void (async () => {
      try {
        const bookIdRaw = req.query["bookId"];
        const authorIdRaw = req.query["authorId"];

        if (typeof bookIdRaw === "string" && bookIdRaw !== "") {
          res.json(await getBookReleases(Number.parseInt(bookIdRaw, 10)));
          return;
        }

        if (typeof authorIdRaw === "string" && authorIdRaw !== "") {
          res.json(await getAuthorReleases(Number.parseInt(authorIdRaw, 10)));
          return;
        }

        res.json(await getRss());
      } catch (err) {
        next(err);
      }
    })();
  });

  async function getBookReleases(bookId: number): Promise<ReleaseResource[]> {
    try {
      const decisions = await releaseSearchService.bookSearch(bookId, true, true, true);
      const prioritized = prioritizeDownloadDecision.prioritizeDecisions(
        toRealDownloadDecisions(decisions)
      );
      return mapDecisionsWithCache(prioritized);
    } catch (ex) {
      throw new NzbDroneClientException(500, ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function getAuthorReleases(authorId: number): Promise<ReleaseResource[]> {
    try {
      const decisions = await releaseSearchService.authorSearch(authorId, false, true, true);
      const prioritized = prioritizeDownloadDecision.prioritizeDecisions(
        toRealDownloadDecisions(decisions)
      );
      return mapDecisionsWithCache(prioritized);
    } catch (ex) {
      throw new NzbDroneClientException(500, ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function getRss(): Promise<ReleaseResource[]> {
    const reports = await rssFetcherAndParser.fetch();
    const decisions = downloadDecisionMaker.getRssDecision(reports);
    const prioritized = prioritizeDownloadDecision.prioritizeDecisions(decisions);
    return mapDecisionsWithCache(prioritized);
  }

  return router;
}

export { mapDecisions };
