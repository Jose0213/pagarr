import type { ICustomFormatSpecification } from "./specifications/customFormatSpecification.js";

/**
 * Ported from NzbDrone.Core/CustomFormats/SpecificationMatchesGroup.cs.
 *
 * C#'s `Dictionary<ICustomFormatSpecification, bool>` keys by specification
 * *instance* (reference identity -- `ICustomFormatSpecification` has no
 * `Equals`/`GetHashCode` override, so default reference equality applies).
 * A JS `Map<ICustomFormatSpecification, boolean>` has the exact same
 * reference-identity key semantics, so it's a direct structural port -- no
 * behavior change.
 *
 * `DidMatch`'s logic, read literally from the C# source:
 *   `!(Matches.Any(m => m.Key.Required && m.Value == false) || Matches.All(m => m.Value == false))`
 * i.e. the group is considered a match UNLESS either (a) some *required*
 * specification in the group failed, or (b) *every* specification in the
 * group failed. Put positively: it matches if no required spec failed AND
 * at least one spec in the group matched.
 */
export interface SpecificationMatchesGroup {
  matches: Map<ICustomFormatSpecification, boolean>;
}

/** Ported from `SpecificationMatchesGroup.DidMatch` computed property. */
export function didMatch(group: SpecificationMatchesGroup): boolean {
  let anyRequiredFailed = false;
  let allFailed = true;

  for (const [spec, matched] of group.matches) {
    if (spec.required && !matched) {
      anyRequiredFailed = true;
    }
    if (matched) {
      allFailed = false;
    }
  }

  return !(anyRequiredFailed || allFailed);
}
