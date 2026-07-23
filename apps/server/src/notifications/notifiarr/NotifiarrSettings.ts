import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";

/** Ported from NzbDrone.Core/Notifications/Notifiarr/NotifiarrSettings.cs. */
export interface NotifiarrSettings extends IProviderConfig {
  apiKey: string;
}

export function createNotifiarrSettings(
  overrides: Partial<NotifiarrSettings> = {}
): NotifiarrSettings {
  return {
    apiKey: "",
    validate(): ValidationResult {
      return validateNotifiarrSettings(this);
    },
    ...overrides,
  };
}

/** Ported from NotifiarrSettingsValidator: `RuleFor(c => c.APIKey).NotEmpty()`. */
export function validateNotifiarrSettings(settings: NotifiarrSettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push({ propertyName: "APIKey", errorMessage: "'API Key' must not be empty." });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
