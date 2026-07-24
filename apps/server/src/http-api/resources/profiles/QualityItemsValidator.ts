import type { ValidationFailure } from "../../../validation/validationResult.js";
import { Quality } from "../../../qualities/quality.js";
import type { QualityProfileQualityItemResource } from "./QualityProfileResource.js";

/**
 * Ported from Readarr.Api.V1/Profiles/Quality/QualityItemsValidator.cs.
 *
 * DEVIATION -- FluentValidation-to-plain-function: same mechanism deviation
 * as QualityCutoffValidator.ts. C#'s `QualityItemsValidator.ValidItems<T>()`
 * chains NINE `PropertyValidator`s onto one `RuleFor(c => c.Items)`:
 * `NotEmptyValidator`, `AllowedValidator`, `QualityNameValidator`,
 * `GroupItemValidator`, `ItemGroupIdValidator`, `UniqueIdValidator`,
 * `UniqueQualityIdValidator`, `AllQualitiesValidator`,
 * `ItemGroupNameValidator` (nine `SetValidator` calls total, note the source
 * order differs slightly from FluentValidation's own default "stop on first
 * failure per rule chain unless CascadeMode.Continue" -- `RuleFor(...)
 * .SetValidator(...)` chained calls each attach an INDEPENDENT validator to
 * the same property, so ALL NINE run regardless of earlier failures, exactly
 * like nine separate `RuleFor(c => c.Items).Must(...)` calls would --
 * ported here as nine independent checks that all run and all contribute
 * their own failure message if triggered, matching that non-short-circuiting
 * behavior).
 *
 * `validQualityItems()` below runs all nine and returns every failure that
 * fired (order matches the C# `SetValidator` call order), for
 * `QualityProfileController.ts`'s `sharedValidator` to append to its own
 * failure list.
 */

const PROPERTY_NAME = "items";

/**
 * Ported spirit of the C# source's unguarded `item.Quality.Id` /
 * `quality.Quality.Id` dereferences inside `UniqueQualityIdValidator`/
 * `AllQualitiesValidator`: a malformed leaf item with `Quality == null`
 * throws a NullReferenceException in the real C# source (there is no null
 * check on that path -- see this file's `checkUniqueQualityId` doc comment).
 * This throws a comparably-faithful TypeError-shaped error instead of
 * silently treating a missing quality as valid/absent, matching "preserve
 * actual behavior, don't silently fix" for this known-fragile input shape.
 */
function requireQualityId(quality: { id: number } | null): number {
  if (quality === null) {
    throw new TypeError("Cannot read properties of null (reading 'id')");
  }
  return quality.id;
}

/** Ported from the bare `NotEmptyValidator` (no name, no `WithMessage`) -- default FluentValidation message shape for a `RuleFor(c => c.Items)` with no property-name override. */
function checkNotEmpty(items: QualityProfileQualityItemResource[]): ValidationFailure | null {
  if (items.length === 0) {
    return { propertyName: PROPERTY_NAME, errorMessage: "'Items' must not be empty." };
  }
  return null;
}

/** Ported from AllowedValidator: at least one item (leaf OR group, this checks the top-level list only -- matches the C# source, which does NOT recurse into group `.Items`) must be Allowed. */
function checkAllowed(items: QualityProfileQualityItemResource[]): ValidationFailure | null {
  if (!items.some((c) => c.allowed)) {
    return {
      propertyName: PROPERTY_NAME,
      errorMessage: "Must contain at least one allowed quality",
    };
  }
  return null;
}

/** Ported from GroupItemValidator: any item WITH a name (i.e. intended as a group) must have more than one nested quality. */
function checkGroupItem(items: QualityProfileQualityItemResource[]): ValidationFailure | null {
  const hasBadGroup = items.some(
    (i) => i.name != null && i.name.trim() !== "" && i.items.length <= 1
  );
  if (hasBadGroup) {
    return { propertyName: PROPERTY_NAME, errorMessage: "Groups must contain multiple qualities" };
  }
  return null;
}

/** Ported from QualityNameValidator: a leaf item (has a `Quality`) must NOT also carry a `Name` (names are reserved for groups). */
function checkQualityName(items: QualityProfileQualityItemResource[]): ValidationFailure | null {
  const hasBad = items.some((i) => i.name != null && i.name.trim() !== "" && i.quality != null);
  if (hasBad) {
    return {
      propertyName: PROPERTY_NAME,
      errorMessage: "Individual qualities should not be named",
    };
  }
  return null;
}

/** Ported from ItemGroupNameValidator: a group item (`Quality == null`) MUST have a non-blank `Name`. */
function checkItemGroupName(items: QualityProfileQualityItemResource[]): ValidationFailure | null {
  const hasBad = items.some((i) => i.quality == null && (i.name == null || i.name.trim() === ""));
  if (hasBad) {
    return { propertyName: PROPERTY_NAME, errorMessage: "Groups must have a name" };
  }
  return null;
}

/** Ported from ItemGroupIdValidator: a group item (`Quality == null`) MUST have a non-zero `Id`. */
function checkItemGroupId(items: QualityProfileQualityItemResource[]): ValidationFailure | null {
  const hasBad = items.some((i) => i.quality == null && i.id === 0);
  if (hasBad) {
    return { propertyName: PROPERTY_NAME, errorMessage: "Groups must have an ID" };
  }
  return null;
}

/** Ported from UniqueIdValidator: every non-zero top-level item `Id` (group ids) must be unique. */
function checkUniqueId(items: QualityProfileQualityItemResource[]): ValidationFailure | null {
  const ids = items.filter((i) => i.id > 0).map((i) => i.id);
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) {
      return { propertyName: PROPERTY_NAME, errorMessage: "Groups must have a unique ID" };
    }
    seen.add(id);
  }
  return null;
}

/**
 * Ported from UniqueQualityIdValidator: every quality id, across both group
 * members (for items with `Id > 0`, i.e. groups) and leaf items (`Id ===
 * 0`), must appear at most once. Ported preserving the C# source's exact
 * branch condition (`item.Id > 0` selects the "treat as group, iterate
 * `.Items`" path; anything else, including a malformed group with `Id ===
 * 0`, falls to the "treat as leaf, read `.Quality` directly" path and
 * dereferences `item.Quality.Id` -- a real NullReferenceException risk in
 * the C# source if `Quality` is null there; not additionally guarded here,
 * matching "preserve actual behavior, don't silently fix" -- this would
 * throw a TypeError in that same malformed-input case, which is the
 * faithful TS analog of the C# NRE).
 */
function checkUniqueQualityId(
  items: QualityProfileQualityItemResource[]
): ValidationFailure | null {
  const qualityIds = new Set<number>();

  for (const item of items) {
    if (item.id > 0) {
      for (const quality of item.items) {
        const qid = requireQualityId(quality.quality);
        if (qualityIds.has(qid)) {
          return { propertyName: PROPERTY_NAME, errorMessage: "Qualities can only be used once" };
        }
        qualityIds.add(qid);
      }
    } else {
      const qid = requireQualityId(item.quality);
      if (qualityIds.has(qid)) {
        return { propertyName: PROPERTY_NAME, errorMessage: "Qualities can only be used once" };
      }
      qualityIds.add(qid);
    }
  }

  return null;
}

/** Ported from AllQualitiesValidator: every known `Quality.All` id must appear somewhere in the submitted items (same group/leaf id-collection walk as checkUniqueQualityId, but tolerating duplicates -- just checking coverage). */
function checkAllQualities(items: QualityProfileQualityItemResource[]): ValidationFailure | null {
  const qualityIds = new Set<number>();

  for (const item of items) {
    if (item.id > 0) {
      for (const quality of item.items) {
        qualityIds.add(requireQualityId(quality.quality));
      }
    } else {
      qualityIds.add(requireQualityId(item.quality));
    }
  }

  const missing = Quality.All.some((quality) => !qualityIds.has(quality.id));

  if (missing) {
    return { propertyName: PROPERTY_NAME, errorMessage: "Must contain all qualities" };
  }
  return null;
}

/**
 * Ported from `QualityItemsValidator.ValidItems<T>()`'s full nine-validator
 * chain, run in the real source's exact `SetValidator` call order. Every
 * check runs (non-short-circuiting, see module doc comment); returns every
 * failure that fired.
 */
export function validQualityItems(items: QualityProfileQualityItemResource[]): ValidationFailure[] {
  const checks = [
    checkNotEmpty,
    checkAllowed,
    checkQualityName,
    checkGroupItem,
    checkItemGroupId,
    checkUniqueId,
    checkUniqueQualityId,
    checkAllQualities,
    checkItemGroupName,
  ];

  const failures: ValidationFailure[] = [];
  for (const check of checks) {
    const failure = check(items);
    if (failure) {
      failures.push(failure);
    }
  }
  return failures;
}
