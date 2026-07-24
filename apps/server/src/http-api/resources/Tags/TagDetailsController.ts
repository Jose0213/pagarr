import type { Router } from "express";
import { restController } from "../../rest/RestController.js";
import type { TagService } from "../../../tags/tagService.js";
import { tagDetailsListToResource, tagDetailsToResource } from "./TagDetailsResource.js";
import type { TagDetailsResource } from "./TagDetailsResource.js";

/**
 * Ported from Readarr.Api.V1/Tags/TagDetailsController.cs. Mounted at
 * `tag/detail` (`[V1ApiController("tag/detail")]`) -- read-only: GET / and
 * GET /:id only, no create/update/delete (the real C# controller extends
 * plain `RestController<TagDetailsResource>` and defines neither
 * `[RestPostById]` nor `[RestPutById]`/`[RestDeleteById]` actions).
 */
export interface TagDetailsControllerOptions {
  tagService: TagService;
}

export function tagDetailsController(options: TagDetailsControllerOptions): Router {
  const { tagService } = options;

  return restController<TagDetailsResource>({
    getAll: () => tagDetailsListToResource(tagService.detailsAll()),
    getById: (id) => tagDetailsToResource(tagService.details(id)),
  });
}
