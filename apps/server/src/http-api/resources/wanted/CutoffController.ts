import { Router, type Request } from "express";
import type { Author, Book } from "../../../books/models.js";
import { PagingSpec, SortDirection } from "../../../db/paging-spec.js";
import type { IBookCutoffServiceLike } from "../../../indexer-search/collaborators.js";
import {
  parsePagingRequest,
  buildPagingResource,
  mapToPagingSpec,
  applyToPage,
  type PagingResource,
} from "../../rest/Paging.js";
import { toWantedBookResource, type WantedBookResource } from "./WantedBookResource.js";

/**
 * Ported from Readarr.Api.V1/Wanted/CutoffController.cs. Mounted at
 * `/wanted/cutoff` (the real `[V1ApiController("wanted/cutoff")]` route
 * base).
 *
 * See WantedBookResource.ts's doc comment for why this doesn't build on the
 * real `BookControllerWithSignalR`/`BookResource`, and
 * MissingController.ts's doc comment for the shared Author.monitored
 * filter caveat this controller has too (identical filter shape, ported
 * the same way).
 *
 * ## `IBookCutoffService` -- forward-ref gap, already documented elsewhere
 *
 * `books/bookRepository.ts` (already merged) explicitly does NOT port
 * `BooksWhereCutoffUnmet` (needs `IQualityProfileService`/
 * `QualitiesBelowCutoff`, a dependency chain that file's own doc comment
 * flags as out of scope for the Books module), and consequently
 * `books/bookService.ts` has no `booksWhereCutoffUnmet` method either.
 * `indexer-search/collaborators.ts` already forward-references the
 * resulting gap as `IBookCutoffServiceLike` (narrowed to the one method
 * `indexer-search/bookSearchService.ts` calls) for the exact same reason
 * this controller needs it -- this module imports and reuses THAT existing
 * forward-ref rather than declaring a third independent copy of the same
 * gap. A real `IBookCutoffService` implementation, once the
 * QualityProfile-cutoff dependency chain lands, should satisfy both call
 * sites without either needing to change.
 */
export interface CutoffControllerOptions {
  bookCutoffService: IBookCutoffServiceLike;
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

/** Ported from `CutoffController` factory. */
export function cutoffController(options: CutoffControllerOptions): Router {
  const { bookCutoffService, authorLookup } = options;

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
          (spec) => bookCutoffService.booksWhereCutoffUnmet(spec),
          (book) => {
            const author = authorLookup.getAuthorByMetadataId(book.authorMetadataId);
            const hydrated: Book = author ? { ...book, author } : book;

            return { hydrated, resource: toWantedBookResource(hydrated, includeAuthor) };
          }
        );

        const envelope: PagingResource<WantedBookResource> = {
          ...rawEnvelope,
          // See MissingController.ts's identical filter for the full doc
          // comment on why this is applied in-memory here.
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
