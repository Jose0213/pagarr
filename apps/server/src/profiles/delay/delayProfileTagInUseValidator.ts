import type { DelayProfileService } from "./delayProfileService.js";

/**
 * Ported from NzbDrone.Core/Profiles/Delay/DelayProfileTagInUseValidator.cs.
 *
 * C# implemented this as a FluentValidation `PropertyValidator` plugged
 * into a validation-rule pipeline (FluentValidation isn't ported yet -- no
 * Phase 0/1 module owns it per PORT_PLAN.md). Ported here as a plain
 * predicate function with the same name/semantics: given the tags being
 * assigned to a DelayProfile (existing or new, identified by `instanceId`,
 * 0 for "not yet created"), returns true (valid) unless some *other*
 * DelayProfile already claims one of those tags. When a validation-pipeline
 * module lands, this predicate slots in as its `IsValid` body unchanged.
 */
export function delayProfileTagsAreValid(
  delayProfileService: DelayProfileService,
  instanceId: number,
  tags: Set<number> | null | undefined
): boolean {
  if (tags == null || tags.size === 0) {
    return true;
  }

  return delayProfileService
    .all()
    .every((d) => d.id === instanceId || !intersects(d.tags, tags));
}

function intersects(a: Set<number>, b: Set<number>): boolean {
  for (const value of a) {
    if (b.has(value)) {
      return true;
    }
  }
  return false;
}
