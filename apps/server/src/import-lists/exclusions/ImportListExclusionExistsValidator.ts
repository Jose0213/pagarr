import type { IImportListExclusionService } from "./ImportListExclusionService.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Exclusions/ImportListExclusionExistsValidator.cs.
 *
 * C#'s `PropertyValidator` (FluentValidation) integrates into a
 * `RuleFor(...).SetValidator(...)` pipeline this port doesn't have (see
 * `thingi-provider/IProviderConfig.ts`'s doc comment: FluentValidation
 * itself isn't ported). Ported as a plain predicate function a future
 * ImportListExclusion-add validation path can call directly -- same
 * "narrow to the minimal interface actually needed" approach this module
 * takes elsewhere for FluentValidation-backed validators (see
 * `indexers/newznab/newznabSettings.ts`'s doc comment).
 */
export function importListExclusionExists(
  importListExclusionService: IImportListExclusionService,
  foreignId: string | null | undefined
): boolean {
  if (foreignId === null || foreignId === undefined) {
    return false;
  }

  return importListExclusionService.all().some((s) => s.foreignId === foreignId);
}

/** Default error message, matching `GetDefaultMessageTemplate()`. */
export const IMPORT_LIST_EXCLUSION_EXISTS_MESSAGE = "This exclusion has already been added.";
