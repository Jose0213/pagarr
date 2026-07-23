import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";

/** Ported from NzbDrone.Core/Notifications/Prowl/ProwlSettings.cs. */
export interface ProwlSettings extends IProviderConfig {
  apiKey: string;
  priority: number;
}

export function createProwlSettings(overrides: Partial<ProwlSettings> = {}): ProwlSettings {
  return {
    apiKey: "",
    priority: 0,
    validate(): ValidationResult {
      return validateProwlSettings(this);
    },
    ...overrides,
  };
}

/** Ported from ProwlSettingsValidator: `RuleFor(c => c.ApiKey).NotEmpty()`. */
export function validateProwlSettings(settings: ProwlSettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push({ propertyName: "ApiKey", errorMessage: "'Api Key' must not be empty." });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}

/** Ported from `ProwlSettings.IsValid`. */
export function isProwlSettingsValid(settings: ProwlSettings): boolean {
  return (
    !!settings.apiKey &&
    settings.apiKey.trim() !== "" &&
    settings.priority >= -2 &&
    settings.priority <= 2
  );
}
