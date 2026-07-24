import { Router, type Request } from "express";
import type { Author, Book } from "../../../books/models.js";
import { PagingSpec, SortDirection } from "../../../db/paging-spec.js";
import {
  parsePagingRequest,
  buildPagingResource,
  mapToPagingSpec,
  applyToPage,
  type PagingResource,
} from "../../rest/Paging.js";
import { toWantedBookResource, type WantedBookResource } from "./WantedBookResource.js";

/**
 * Ported from Readarr.Api.V1/Wanted/MissingController.cs. Mounted at
 * `/wanted/missing` (the real `[V1ApiController("wanted/missing")]` route
 * base).
 *
 * See WantedBookResource.ts's doc comment for why this doesn't build on the
 * real `BookControllerWithSignalR`/`BookResource` (owned by a sibling Phase
 * 5 group, out of this worktree's scope).
 *
 * ## `Author.Monitored` half of the real filter -- not representable, see
 * `indexer-search/bookSearchService.ts`'s `monitoredBooksPagingSpec` doc
 * comment for the identical, already-documented gap
 *
 * The real C# filter is `v.Monitored == true && v.Author.Value.Monitored ==
 * true` (or the inverse for `monitored=false`) -- spanning both the Book row
 * and its joined Author row. This port's `FilterExpression<Book>`
 * (db/filter.ts) is structurally limited to `Book`'s own columns, so only
 * the `Book.monitored` half is pushed down as a SQL filter; the
 * `Author.monitored` half is applied as an in-memory post-filter here
 * (requiring a hydrated `book.author` per row, via `authorLookup` -- see
 * below), which is both correct AND necessary regardless of the filter-type
 * limitation, since `bookService.booksWithoutFiles`'s underlying query
 * doesn't join Authors at all (see bookRepository.ts's doc comment).
 *
 * IMPORTANT CAVEAT: applying the Author.monitored filter as an in-memory
 * post-filter, AFTER `bookService.booksWithoutFiles` has already applied
 * `LIMIT`/`OFFSET` paging at the SQL layer, means the returned PAGE may
 * legitimately contain fewer than `pageSize` records (or, in the worst
 * case, land on a page whose entire Book.monitored-filtered slice belongs
 * to unmonitored authors and returns empty) even though `totalRecords`
 * still reflects the pre-Author-filter count. The real C# source has this
 * exact same issue in miniature (`FilterExpressions` are a LINQ-expression
 * SQL push-down there too; a true `Author.Monitored` filter would need
 * `BooksWithoutFiles`'s SqlBuilder to actually join+filter on it, which the
 * already-merged `bookRepository.ts` doesn't do -- see that file's own doc
 * comment) -- flagged explicitly per this task's "preserve/document real
 * gaps rather than silently paper over them" instruction, not fixed here
 * (fixing it would mean widening `booksWithoutFiles` itself, outside this
 * worktree's `http-api/resources/` scope).
 */

export interface MissingControllerOptions {
  bookService: {
    booksWithoutFiles(pagingSpec: PagingSpec<Book>): PagingSpec<Book>;
  };
  /** Resolves the Author for a book's `authorMetadataId` -- matches `books/authorService.ts`'s real `AuthorService.getAuthorByMetadataId`. */
  authorLookup: {
    getAuthorByMetadataId(authorMetadataId: number): Author | undefined;
  };
}

function parseBoolQueryParam(req: Request, name: string, defaultValue: boolean): boolean {
  const raw = req.query[name];
  if (raw === undefined) {
    return defaultValue;
  }
  return raw === "true" || raw === "1";
}

/** Ported from `MissingController` factory. */
export function missingController(options: MissingControllerOptions): Router {
  const { bookService, authorLookup } = options;

  const router = Router();

  // ---- GET / ----------------------------------------------------------
  router.get("/", (req, res, next) => {
    void (async () => {
      try {
        const includeAuthor = parseBoolQueryParam(req, "includeAuthor", false);
        const monitored = parseBoolQueryParam(req, "monitored", true);

        const pagingRequest = parsePagingRequest(req);
        const pagingResource = buildPagingResource<WantedBookResource>(pagingRequest);
        const pagingSpec = mapToPagingSpec<WantedBookResource, Book>(pagingResource);

        if (monitored) {
          pagingSpec.filterExpressions.push({ field: "monitored", op: "eq", value: true });
        } else {
          pagingSpec.filterExpressions.push({ field: "monitored", op: "eq", value: false });
        }

        const rawEnvelope = applyToPage(
          pagingSpec,
          (spec) => bookService.booksWithoutFiles(spec),
          (book) => {
            const author = authorLookup.getAuthorByMetadataId(book.authorMetadataId);
            const hydrated: Book = author ? { ...book, author } : book;

            return { hydrated, resource: toWantedBookResource(hydrated, includeAuthor) };
          }
        );

        const envelope: PagingResource<WantedBookResource> = {
          ...rawEnvelope,
          // Ported: the Author.monitored half of the real filter, applied
          // in-memory post-fetch against the (always-hydrated, regardless of
          // `includeAuthor`) Author row -- see module doc comment's caveat.
          // A book whose author couldn't be resolved is kept (never filtered
          // out by an unresolvable condition), matching the real C# `v =>
          // v.Author.Value.Monitored == monitored` only ever seeing a
          // populated `Author.Value` in practice (every Book's
          // `AuthorMetadataId` has a corresponding Author row by referential
          // integrity) -- there is no real "author is null" case to model a
          // drop-vs-keep decision against.
          records: rawEnvelope.records
            .filter(({ hydrated }) =>
              hydrated.author ? hydrated.author.monitored === monitored : true
            )
            .map(({ resource }) => resource),
        };

        res.json(envelope);
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}

export { PagingSpec, SortDirection };
