/**
 * Ported from NzbDrone.Core/ThingiProvider/IProviderConfig.cs.
 *
 * C#'s `Validate()` returns `NzbDroneValidationResult` (from
 * `NzbDrone.Core.Validation`, backed by FluentValidation). That module
 * hasn't been ported in this worktree's scope. The four already-merged
 * sibling modules (Indexers/DownloadClients/CustomFormats/Extras) each
 * independently narrowed this to a minimal `ValidationResult` shape --
 * see `indexers/IIndexerSettings.ts`'s `ValidationResult`/`ValidationFailure`.
 * This module defines the same minimal shape as the canonical home for it
 * (this is the actual base contract those siblings narrowed from), so a
 * later consumer (Notifications) can import from here instead of
 * re-deriving a fourth copy. The siblings themselves are NOT retrofitted
 * to import this -- out of scope per this task's brief.
 */
export interface ValidationFailure {
  propertyName: string;
  errorMessage: string;
  isWarning?: boolean;
  detailedDescription?: string;
}

export interface ValidationResult {
  isValid: boolean;
  hasWarnings: boolean;
  errors: ValidationFailure[];
}

export interface IProviderConfig {
  validate(): ValidationResult;
}
