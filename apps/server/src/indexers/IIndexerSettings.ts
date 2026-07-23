/**
 * Ported from NzbDrone.Core/Indexers/IIndexerSettings.cs. C#'s
 * `IProviderConfig.Validate()` (returning `NzbDroneValidationResult`, from
 * the not-yet-ported `NzbDrone.Core.Validation` namespace + FluentValidation)
 * is narrowed to the minimal validation surface this module's own settings
 * validators (torznab/torznabSettings.ts, newznab/newznabSettings.ts) need
 * to expose -- see those files' doc comments for the full forward-reference
 * rationale.
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

/** Ported from NzbDrone.Core/Indexers/IIndexerSettings.cs. */
export interface IIndexerSettings extends IProviderConfig {
  baseUrl: string;
  earlyReleaseLimit: number | null;
}
