import { Router } from "express";
import { MethodNotAllowedException } from "../../rest/MethodNotAllowedException.js";
import { restController, validateId } from "../../rest/RestController.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import type { DelayProfileService } from "../../../profiles/delay/delayProfileService.js";
import { delayProfileTagsAreValid } from "../../../profiles/delay/delayProfileTagInUseValidator.js";
import {
  delayProfileToModel,
  delayProfileToResource,
  delayProfilesToResources,
  type DelayProfileResource,
} from "./DelayProfileResource.js";

/**
 * Ported from Readarr.Api.V1/Profiles/Delay/DelayProfileController.cs.
 *
 * Built on `restController()` (rest/RestController.ts) for the five base
 * REST routes, plus:
 *
 *   - `DeleteProfile(int id)` overrides the base delete behavior: id == 1
 *     (the fixed global default profile, seeded by migration
 *     0001_initial_setup.sql, see delayProfileService.ts) is refused with
 *     `MethodNotAllowedException` (405) BEFORE the service's own delete is
 *     ever called -- ported directly into the `delete` handler below rather
 *     than as a separate guard, since there's no base-class override point
 *     to hook in Express.
 *   - `PUT /reorder/:id` (`[HttpPut("reorder/{id:int}")]`, `Reorder`): a
 *     custom route mounted alongside the five base routes, following the
 *     same "extra routes layered on `restController()`'s router" pattern
 *     ProviderControllerBase.ts and QualityDefinitionController.ts both use.
 *     `ValidateId(id)` is ported via this module's own `RestController.ts`-
 *     exported `validateId` (see that file's doc comment: "exported
 *     standalone... so ProviderControllerBase and future custom-route
 *     controllers can apply the exact same id check").
 *
 * ## SharedValidator rules (ctor), ported as a combined ResourceValidator
 *
 *   - `Tags`: `NotEmpty()` when `Id != 1`, `EmptyCollection()` when `Id ==
 *     1` (the global profile is never tag-scoped; every other profile MUST
 *     have at least one tag) -- ported literally, including that a
 *     brand-new profile (id 0 at validation time, before insert assigns a
 *     real id) is NOT id 1, so it falls under the `NotEmpty` branch, same
 *     as the real FluentValidation `When(d => d.Id != 1)` evaluated against
 *     the pre-insert resource.
 *   - `Tags.SetValidator(tagInUseValidator)`: ported via
 *     `delayProfileTagsAreValid` (delayProfileTagInUseValidator.ts),
 *     already-ported Phase 1 predicate -- fails if another existing profile
 *     already claims one of the submitted tags.
 *   - `UsenetDelay`/`TorrentDelay`: `GreaterThanOrEqualTo(0)`.
 *   - Custom rule: fails unless at least one of `EnableUsenet`/`EnableTorrent`
 *     is true.
 */

export interface DelayProfileControllerOptions {
  delayProfileService: DelayProfileService;
}

function buildSharedValidator(
  delayProfileService: DelayProfileService
): ResourceValidator<DelayProfileResource> {
  return (resource) => {
    const failures: ValidationFailure[] = [];

    if (resource.id === 1) {
      if (resource.tags.length > 0) {
        failures.push({
          propertyName: "tags",
          errorMessage: "'Tags' must be empty.",
        });
      }
    } else if (resource.tags.length === 0) {
      failures.push({
        propertyName: "tags",
        errorMessage: "'Tags' must not be empty.",
      });
    }

    if (!delayProfileTagsAreValid(delayProfileService, resource.id, new Set(resource.tags))) {
      failures.push({
        propertyName: "tags",
        errorMessage: "Tag already in use by another delay profile",
      });
    }

    if (resource.usenetDelay < 0) {
      failures.push({
        propertyName: "usenetDelay",
        errorMessage: "'Usenet Delay' must be greater than or equal to '0'.",
      });
    }

    if (resource.torrentDelay < 0) {
      failures.push({
        propertyName: "torrentDelay",
        errorMessage: "'Torrent Delay' must be greater than or equal to '0'.",
      });
    }

    if (!resource.enableUsenet && !resource.enableTorrent) {
      failures.push({
        propertyName: "",
        errorMessage: "Either Usenet or Torrent should be enabled",
      });
    }

    return failures;
  };
}

export function delayProfileController(options: DelayProfileControllerOptions): Router {
  const { delayProfileService } = options;
  const sharedValidator = buildSharedValidator(delayProfileService);

  function getResourceById(id: number): DelayProfileResource {
    return delayProfileToResource(delayProfileService.get(id));
  }

  const router = restController<DelayProfileResource>({
    sharedValidator,

    getAll: () => delayProfilesToResources(delayProfileService.all()),
    getById: (id: number) => getResourceById(id),

    create: (resource: DelayProfileResource) => {
      const model = delayProfileToModel(resource);
      const created = delayProfileService.add(model);
      return getResourceById(created.id);
    },

    update: (resource: DelayProfileResource) => {
      const model = delayProfileToModel(resource);
      delayProfileService.update(model);
      return getResourceById(model.id);
    },

    delete: (id: number) => {
      if (id === 1) {
        throw new MethodNotAllowedException("Cannot delete global delay profile");
      }
      delayProfileService.delete(id);
    },
  });

  // ---- PUT /reorder/:id ---------------------------------------------------
  // Ported from [HttpPut("reorder/{id:int}")] Reorder(int id, int? afterId).
  router.put("/reorder/:id", (req, res, next) => {
    try {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      validateId(id);

      const afterIdRaw = req.query["afterId"];
      const afterId =
        typeof afterIdRaw === "string" && afterIdRaw !== ""
          ? Number.parseInt(afterIdRaw, 10)
          : null;

      const reordered = delayProfileService.reorder(id, afterId);
      res.json(delayProfilesToResources(reordered).map(stripDefaultId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
