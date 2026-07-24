import { Router } from "express";
import { restController } from "../../rest/RestController.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import type { ReleaseProfileService } from "../../../profiles/releases/releaseProfileService.js";
import {
  releaseProfileToModel,
  releaseProfileToResource,
  releaseProfilesToResources,
  type ReleaseProfileResource,
} from "./ReleaseProfileResource.js";

/**
 * Ported from Readarr.Api.V1/Profiles/Release/ReleaseProfileController.cs.
 *
 * ## `IIndexerFactory.Exists(int)` forward-reference
 *
 * The ctor's custom rule calls `_indexerFactory.Exists(restriction.IndexerId)`.
 * The already-ported `IIndexerFactory` (indexers/IndexerFactory.ts) is
 * itself a narrowed forward-reference of the real C# base (see that file's
 * own "FORWARD-REFERENCE NARROWING" doc comment) and does not currently
 * declare an `exists(id)` member -- `validation/entityExistsValidators.ts`'s
 * module doc comment flags this exact gap ("the shape DownloadClientFactory
 * would need to add"). Rather than block this controller on widening
 * `IIndexerFactory`'s real interface (out of this task's scope -- Indexers
 * belongs to a sibling agent's worktree per the task brief's "zero file
 * overlap expected"), this controller accepts a minimal `IndexerExistenceCheck`
 * (`{ exists(id): boolean }`, the exact shape `validation/entityExistsValidators.ts`'s
 * `IdExistenceCheck` already establishes for this precise situation) as its
 * own constructor dependency -- any real `IIndexerFactory` implementation
 * that later grows an `exists()` method satisfies this structurally with no
 * further change needed here.
 *
 * ## SharedValidator custom rule (ctor)
 *
 *   - Fails unless at least one of `Required`/`Ignored` is non-empty (ported
 *     from `restriction.Ignored.Empty() && restriction.Required.Empty()`).
 *   - Fails (on the `IndexerId` property specifically, not the whole
 *     resource -- ported from `context.AddFailure(nameof(ReleaseProfile.
 *     IndexerId), "Indexer does not exist")`) if `Enabled` AND `IndexerId !=
 *     0` AND the indexer factory doesn't recognize that id -- i.e. a
 *     disabled restriction, or one scoped to "all indexers" (`IndexerId ==
 *     0`), never needs to reference a real indexer.
 */

export interface IndexerExistenceCheck {
  exists(id: number): boolean;
}

export interface ReleaseProfileControllerOptions {
  releaseProfileService: ReleaseProfileService;
  indexerFactory: IndexerExistenceCheck;
}

function buildSharedValidator(
  indexerFactory: IndexerExistenceCheck
): ResourceValidator<ReleaseProfileResource> {
  return (resource) => {
    const failures: ValidationFailure[] = [];

    if (resource.ignored.length === 0 && resource.required.length === 0) {
      failures.push({
        propertyName: "",
        errorMessage: "Either 'Must contain' or 'Must not contain' is required",
      });
    }

    if (
      resource.enabled &&
      resource.indexerId !== 0 &&
      !indexerFactory.exists(resource.indexerId)
    ) {
      failures.push({ propertyName: "indexerId", errorMessage: "Indexer does not exist" });
    }

    return failures;
  };
}

export function releaseProfileController(options: ReleaseProfileControllerOptions): Router {
  const { releaseProfileService, indexerFactory } = options;
  const sharedValidator = buildSharedValidator(indexerFactory);

  function getResourceById(id: number): ReleaseProfileResource {
    return releaseProfileToResource(releaseProfileService.get(id));
  }

  return restController<ReleaseProfileResource>({
    sharedValidator,

    getAll: () => releaseProfilesToResources(releaseProfileService.all()),
    getById: (id: number) => getResourceById(id),

    create: (resource: ReleaseProfileResource) => {
      const model = releaseProfileToModel(resource);
      const created = releaseProfileService.add(model);
      return getResourceById(created.id);
    },

    update: (resource: ReleaseProfileResource) => {
      const model = releaseProfileToModel(resource);
      releaseProfileService.update(model);
      return getResourceById(resource.id);
    },

    delete: (id: number) => {
      releaseProfileService.delete(id);
    },
  });
}
