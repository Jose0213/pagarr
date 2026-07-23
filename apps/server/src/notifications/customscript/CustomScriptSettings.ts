import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";

/**
 * Ported from NzbDrone.Core/Notifications/CustomScript/CustomScriptSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function deviation
 * as this module's other settings ports. `RuleFor(c => c.Path).IsValidPath()`
 * + `SystemFolderValidator` (both from the not-yet-ported
 * `NzbDrone.Core.Validation.Paths` namespace) are narrowed to a practical
 * non-empty-path check -- full path/system-folder validation belongs to
 * that not-yet-ported module; this notifier's own `Test()` already does a
 * real filesystem `fileExists` check via the injected disk provider, which
 * is the check that actually matters for catching a bad path at test-time.
 */
export interface CustomScriptSettings extends IProviderConfig {
  path: string;
  /** Ported from `Arguments` -- the real C# validator now REJECTS any non-empty value (`RuleFor(c => c.Arguments).Empty()`), see validateCustomScriptSettings()'s doc comment. Field kept (not removed) for shape fidelity with the real settings UI, which still renders it (`Hidden = HiddenType.HiddenIfNotSet`). */
  arguments: string;
}

export function createCustomScriptSettings(
  overrides: Partial<CustomScriptSettings> = {}
): CustomScriptSettings {
  return {
    path: "",
    arguments: "",
    validate(): ValidationResult {
      return validateCustomScriptSettings(this);
    },
    ...overrides,
  };
}

/**
 * Ported from CustomScriptSettingsValidator. REAL C# QUIRK preserved
 * faithfully: `RuleFor(c => c.Arguments).Empty().WithMessage("Arguments are
 * no longer supported for custom scripts")` -- despite the settings UI still
 * exposing an `Arguments` field (see CustomScriptSettings.cs's
 * `[FieldDefinition(1, ...)]`), any non-empty value now FAILS validation.
 * This is a genuine Readarr behavior (arguments were deprecated but the
 * field wasn't removed) -- preserved as-is, not "fixed" by silently
 * ignoring the field or removing the validation rule.
 */
export function validateCustomScriptSettings(settings: CustomScriptSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!settings.path || settings.path.trim() === "") {
    errors.push({ propertyName: "Path", errorMessage: "Invalid path" });
  }

  if (settings.arguments && settings.arguments.trim() !== "") {
    errors.push({
      propertyName: "Arguments",
      errorMessage: "Arguments are no longer supported for custom scripts",
    });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
