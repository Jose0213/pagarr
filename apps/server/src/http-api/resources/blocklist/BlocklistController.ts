import { Router } from "express";
import type { Author } from "../../../books/models.js";
import type { Blocklist } from "../../../blocklisting/blocklist.js";
import type { IBlocklistService } from "../../../blocklisting/blocklistService.js";
import type { CustomFormatCalculationService } from "../../../custom-formats/customFormatCalculationService.js";
import { PagingSpec, SortDirection } from "../../../db/paging-spec.js";
import { BadRequestException } from "../../rest/BadRequestException.js";
import {
  parsePagingRequest,
  buildPagingResource,
  mapToPagingSpec,
  applyToPage,
  type PagingResource,
} from "../../rest/Paging.js";
import { authorToResource } from "../author/AuthorResource.js";
import { toBlocklistResource, type BlocklistResource } from "./BlocklistResource.js";
import type { BlocklistBulkResource } from "./BlocklistBulkResource.js";

/**
 * Ported from Readarr.Api.V1/Blocklist/BlocklistController.cs. Mounted at
 * `/blocklist` (the real `[V1ApiController]` default route).
 */

/** Narrowed to the one method this controller calls -- matches `books/authorService.ts`'s real `AuthorService.getAuthor`. */
export interface AuthorLookup {
  getAuthor(authorId: number): Author;
}

export interface BlocklistControllerOptions {
  blocklistService: IBlocklistService;
  formatCalculator: CustomFormatCalculationService;
  authorService: AuthorLookup;
}

function parseIdParam(req: { params: Record<string, string | undefined> }): number {
  return Number.parseInt(req.params["id"] ?? "", 10);
}

/** Ported from `BlocklistController` factory. */
export function blocklistController(options: BlocklistControllerOptions): Router {
  const { blocklistService, formatCalculator, authorService } = options;

  /** Ported from `BlocklistResourceMapper.MapToResource` call site's implicit `model.Author` join -- see BlocklistResource.ts's doc comment on why this port resolves it explicitly instead. */
  function mapToResource(model: Blocklist): BlocklistResource {
    const author = model.author ?? authorService.getAuthor(model.authorId);
    const customFormats = formatCalculator.parseCustomFormatForBlocklist(model, author);
    return toBlocklistResource(model, authorToResource(author), customFormats);
  }

  const router = Router();

  // ---- DELETE /bulk ----------------------------------------------------
  // Mounted BEFORE "/:id" so Express doesn't treat "bulk" as an :id value.
  router.delete("/bulk", (req, res, next) => {
    try {
      const resource = req.body as BlocklistBulkResource;
      blocklistService.deleteMany(resource.ids);
      res.json({});
    } catch (err) {
      next(err);
    }
  });

  // ---- DELETE /:id (RestDeleteById -- WITH id validation) -----------------
  router.delete("/:id", (req, res, next) => {
    try {
      const id = parseIdParam(req);
      if (!(Number.isInteger(id) && id > 0)) {
        throw new BadRequestException(`${id} is not a valid ID`);
      }

      blocklistService.delete(id);
      res.json({});
    } catch (err) {
      next(err);
    }
  });

  // ---- GET / ----------------------------------------------------------
  router.get("/", (req, res, next) => {
    try {
      const pagingRequest = parsePagingRequest(req);
      const pagingResource = buildPagingResource<BlocklistResource>(pagingRequest);
      const pagingSpec = mapToPagingSpec<BlocklistResource, Blocklist>(
        pagingResource,
        "date",
        SortDirection.Descending
      );

      const envelope: PagingResource<BlocklistResource> = applyToPage(
        pagingSpec,
        (spec) => blocklistService.paged(spec),
        (b) => mapToResource(b)
      );

      res.json(envelope);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export { PagingSpec };
