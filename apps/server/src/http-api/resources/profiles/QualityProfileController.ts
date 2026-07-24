import { Router } from "express";
import { restController } from "../../rest/RestController.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import type {
  CustomFormatLookup,
  QualityProfileService,
} from "../../../profiles/qualities/qualityProfileService.js";
import { isValidCutoff } from "./QualityCutoffValidator.js";
import { validQualityItems } from "./QualityItemsValidator.js";
import {
  qualityProfileToModel,
  qualityProfileToResource,
  qualityProfilesToResources,
  type QualityProfileResource,
} from "./QualityProfileResource.js";

/**
 * Ported from Readarr.Api.V1/Profiles/Quality/QualityProfileController.cs.
 *
 * ## SharedValidator rules (ctor)
 *
 *   - `Name`: `NotEmpty()`.
 *   - `Cutoff`: `ValidCutoff()` -- ported via `isValidCutoff`, given both
 *     `Cutoff` and `Items` from the same resource (see QualityCutoffValidator.ts's
 *     doc comment on why this port passes both explicitly instead of
 *     reaching into ambient FluentValidation parent-context).
 *   - `Items`: `ValidItems()` -- ported via `validQualityItems`
 *     (QualityItemsValidator.ts).
 *   - `FormatItems`: `Must(...)` -- every CustomFormat the format service
 *     currently knows about must appear EXACTLY once in `FormatItems` (no
 *     missing ones, per `all.Except(ids).Empty()` -- note this check is
 *     one-directional: it does NOT fail for an EXTRA format id in
 *     `FormatItems` that no longer exists in `_formatService.All()`, only
 *     for one that's missing; ported exactly, including that asymmetry).
 *   - Custom rule: `MinFormatScore` must be satisfiable -- fails if BOTH
 *     the sum of all positive-score FormatItems AND the single highest
 *     FormatItem score fall short of `MinFormatScore` (ported literally:
 *     `if (sumOfPositive < MinFormatScore && maxScore < MinFormatScore)`,
 *     note this throws `InvalidOperationException` via `.Max()` if
 *     `FormatItems` is empty -- .NET's `Enumerable.Max()` throws
 *     "Sequence contains no elements" on an empty sequence; ported
 *     faithfully as a thrown error, not silently skipped, matching
 *     "preserve actual behavior, don't silently fix").
 */

export interface QualityProfileControllerOptions {
  qualityProfileService: QualityProfileService;
  formatService: CustomFormatLookup;
}

function buildSharedValidator(
  formatService: CustomFormatLookup
): ResourceValidator<QualityProfileResource> {
  return (resource) => {
    const failures: ValidationFailure[] = [];

    if (!resource.name || resource.name.trim() === "") {
      failures.push({ propertyName: "name", errorMessage: "'Name' must not be empty." });
    }

    if (!isValidCutoff(resource.cutoff, resource.items)) {
      failures.push({
        propertyName: "cutoff",
        errorMessage: "Cutoff must be an allowed quality or group",
      });
    }

    failures.push(...validQualityItems(resource.items));

    const allFormatIds = formatService.all().map((f) => f.id);
    const submittedIds = new Set(resource.formatItems.map((i) => i.format));
    const missingAny = allFormatIds.some((id) => !submittedIds.has(id));

    if (missingAny) {
      failures.push({
        propertyName: "formatItems",
        errorMessage:
          "All Custom Formats and no extra ones need to be present inside your Profile! Try refreshing your browser.",
      });
    }

    const positiveSum = resource.formatItems
      .filter((x) => x.score > 0)
      .reduce((sum, x) => sum + x.score, 0);

    // Ported preserving C#'s `&&` short-circuit exactly: `FormatItems.Max(...)`
    // (a real InvalidOperationException on an empty sequence, matching
    // .NET's `Enumerable.Max()`) is only ever evaluated when the first
    // operand is already true -- an empty FormatItems list with
    // MinFormatScore <= 0 (positiveSum is 0 for an empty list, so `0 <
    // minFormatScore` is false whenever minFormatScore <= 0) never reaches
    // .Max() at all, exactly as in the real source. See module doc comment.
    if (positiveSum < resource.minFormatScore) {
      if (resource.formatItems.length === 0) {
        throw new Error("Sequence contains no elements");
      }

      const maxScore = Math.max(...resource.formatItems.map((x) => x.score));

      if (maxScore < resource.minFormatScore) {
        failures.push({
          propertyName: "",
          errorMessage: "Minimum Custom Format Score can never be satisfied",
        });
      }
    }

    return failures;
  };
}

export function qualityProfileController(options: QualityProfileControllerOptions): Router {
  const { qualityProfileService, formatService } = options;
  const sharedValidator = buildSharedValidator(formatService);

  function getResourceById(id: number): QualityProfileResource {
    return qualityProfileToResource(qualityProfileService.get(id));
  }

  return restController<QualityProfileResource>({
    sharedValidator,

    getAll: () => qualityProfilesToResources(qualityProfileService.all()),
    getById: (id: number) => getResourceById(id),

    create: (resource: QualityProfileResource) => {
      const model = qualityProfileToModel(resource);
      const created = qualityProfileService.add(model);
      return getResourceById(created.id);
    },

    update: (resource: QualityProfileResource) => {
      const model = qualityProfileToModel(resource);
      qualityProfileService.update(model);
      return getResourceById(model.id);
    },

    delete: (id: number) => {
      qualityProfileService.delete(id);
    },
  });
}
