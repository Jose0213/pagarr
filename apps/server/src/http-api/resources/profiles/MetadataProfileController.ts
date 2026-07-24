import { Router } from "express";
import { restController } from "../../rest/RestController.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import type { MetadataProfileService } from "../../../profiles/metadata/metadataProfileService.js";
import {
  metadataProfileToModel,
  metadataProfileToResource,
  metadataProfilesToResources,
  type MetadataProfileResource,
} from "./MetadataProfileResource.js";

/**
 * Ported from Readarr.Api.V1/Profiles/Metadata/MetadataProfileController.cs.
 *
 * ## SharedValidator rules (ctor)
 *
 *   - `Name`: `NotEqual("None")` (message: "'None' is a reserved profile
 *     name") THEN `NotEmpty()` -- ported preserving check ORDER (a request
 *     with `Name == "None"` fails with the reserved-name message even
 *     though it's also non-empty; an empty name additionally fails
 *     `NotEmpty` on top -- both checks run independently in FluentValidation
 *     by default, so both failures can appear together for `Name == ""`...
 *     but `"" != "None"` so only the NotEmpty failure fires for a blank
 *     name. The two checks are independent boolean tests here, matching
 *     FluentValidation's non-short-circuiting-by-default rule chain.)
 *   - `MinPopularity`/`MinPages`: `GreaterThanOrEqualTo(0)`.
 *   - `AllowedLanguages`: when non-blank
 *     (`IsNotNullOrWhiteSpace()`), every comma-separated, trimmed entry must
 *     be either the literal string `"null"` or a known Calibre language
 *     name/code (`NzbDrone.Core.Books.Calibre.Extensions.KnownLanguages`).
 *
 * ## `KnownLanguages` forward-reference
 *
 * The Calibre `KnownLanguages` lookup table (NzbDrone.Core/Books/Calibre/
 * Extensions.cs) belongs to the not-yet-ported Books/Calibre module -- same
 * situation `metadataProfileService.ts`'s `canonicalizeLanguage` dependency
 * already documents and solves the same way: this controller accepts an
 * optional `isKnownLanguage` predicate (defaults to permissive, i.e. every
 * language string passes) so the rule's STRUCTURE ports faithfully today
 * (comma-split, trim, "null" literal allowed, `IsNotNullOrWhiteSpace` gate)
 * while the real Calibre lookup table can be wired in later via this same
 * seam, without changing this controller's shape.
 */

export interface MetadataProfileControllerOptions {
  profileService: MetadataProfileService;
  /** See module doc comment's "KnownLanguages forward-reference" section. Defaults to permissive (always known) until the Calibre module is ported. */
  isKnownLanguage?: (name: string) => boolean;
}

function buildSharedValidator(
  isKnownLanguage: (name: string) => boolean
): ResourceValidator<MetadataProfileResource> {
  return (resource) => {
    const failures: ValidationFailure[] = [];

    if (resource.name === "None") {
      failures.push({
        propertyName: "name",
        errorMessage: "'None' is a reserved profile name",
      });
    }

    if (!resource.name || resource.name.trim() === "") {
      failures.push({
        propertyName: "name",
        errorMessage: "'Name' must not be empty.",
      });
    }

    if (resource.minPopularity < 0) {
      failures.push({
        propertyName: "minPopularity",
        errorMessage: "'Min Popularity' must be greater than or equal to '0'.",
      });
    }

    if (resource.minPages < 0) {
      failures.push({
        propertyName: "minPages",
        errorMessage: "'Min Pages' must be greater than or equal to '0'.",
      });
    }

    if (resource.allowedLanguages != null && resource.allowedLanguages.trim() !== "") {
      const entries = resource.allowedLanguages
        .replace(/^,+|,+$/g, "")
        .split(",")
        .map((y) => y.trim());
      const allKnown = entries.every((y) => y === "null" || isKnownLanguage(y));

      if (!allKnown) {
        failures.push({
          propertyName: "allowedLanguages",
          errorMessage: "Unknown languages",
        });
      }
    }

    return failures;
  };
}

export function metadataProfileController(options: MetadataProfileControllerOptions): Router {
  const { profileService } = options;
  const isKnownLanguage = options.isKnownLanguage ?? (() => true);
  const sharedValidator = buildSharedValidator(isKnownLanguage);

  function getResourceById(id: number): MetadataProfileResource {
    return metadataProfileToResource(profileService.get(id));
  }

  return restController<MetadataProfileResource>({
    sharedValidator,

    getAll: () => metadataProfilesToResources(profileService.all()),
    getById: (id: number) => getResourceById(id),

    create: (resource: MetadataProfileResource) => {
      const model = metadataProfileToModel(resource);
      const created = profileService.add(model);
      return getResourceById(created.id);
    },

    update: (resource: MetadataProfileResource) => {
      const model = metadataProfileToModel(resource);
      profileService.update(model);
      return getResourceById(model.id);
    },

    delete: (id: number) => {
      profileService.delete(id);
    },
  });
}
