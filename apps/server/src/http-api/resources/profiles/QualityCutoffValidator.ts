import type { QualityProfileQualityItemResource } from "./QualityProfileResource.js";

/**
 * Ported from Readarr.Api.V1/Profiles/Quality/QualityCutoffValidator.cs.
 *
 * DEVIATION -- FluentValidation-to-plain-function: same mechanism deviation
 * documented throughout this port (see rest/ResourceValidator.ts,
 * validation/ruleHelpers.ts). C#'s `ValidCutoffValidator<T> : PropertyValidator`
 * reaches into `context.ParentContext.InstanceToValidate` (FluentValidation's
 * "look at a sibling property on the same object being validated" escape
 * hatch, since a `PropertyValidator` only otherwise sees the one property it
 * was attached to) to read the profile's own `Items` array alongside the
 * `Cutoff` int it's directly validating. This port has no such ambient
 * context -- `isValidCutoff` takes both values as explicit parameters
 * instead, called by the profile-level `sharedValidator` (see
 * QualityProfileController.ts) which already has the whole resource in
 * hand.
 *
 * ## Matching rule (ported exactly)
 *
 * `cutoffItem = items.SingleOrDefault(i => (i.Quality == null && i.Id ==
 * cutoff) || i.Quality?.Id == cutoff)`: a cutoff value matches EITHER a
 * group item (`Quality == null`) whose own `Id` equals the cutoff (group
 * ids are the synthetic 1000+ values `QualityProfileService.getDefaultProfile`
 * assigns, see qualityProfileService.ts), OR a leaf item whose `Quality.Id`
 * equals the cutoff. `SingleOrDefault` throws if MORE THAN ONE item matches
 * (a real possibility if a client submits a malformed/duplicate `Items`
 * array with two entries sharing an id) -- ported faithfully as a thrown
 * error, not silently taking the first match, matching .NET's
 * `InvalidOperationException: Sequence contains more than one matching
 * element`.
 *
 * Valid only if a match was found AND that item's `Allowed` is `true`
 * (`cutoffItem is { Allowed: true }` -- a C# pattern match that's `false`
 * for both "no match" (`null`) and "match found but Allowed == false").
 */
export function isValidCutoff(cutoff: number, items: QualityProfileQualityItemResource[]): boolean {
  const matches = items.filter(
    (i) => (i.quality === null && i.id === cutoff) || i.quality?.id === cutoff
  );

  if (matches.length > 1) {
    throw new Error("Sequence contains more than one matching element");
  }

  const cutoffItem = matches[0];

  return cutoffItem !== undefined && cutoffItem.allowed === true;
}
