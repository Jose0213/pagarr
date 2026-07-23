import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";

/**
 * Ported from NzbDrone.Core/Notifications/Gotify/GotifySettings.cs.
 * `isValidUrl()` (a shared FluentValidation extension used across several
 * of these notifiers' validators, e.g. Ntfy/Apprise too) is narrowed to a
 * plain `new URL(...)` try/catch, matching this port's established
 * convention for that same FluentValidation extension elsewhere (see
 * indexers' `newznabSettings.ts`'s `isValidRootUrl`).
 */
export interface GotifySettings extends IProviderConfig {
  server: string;
  appToken: string;
  priority: number;
}

/** Ported from GotifySettings's default ctor: `Priority = 5`. */
export function createGotifySettings(overrides: Partial<GotifySettings> = {}): GotifySettings {
  return {
    server: "",
    appToken: "",
    priority: 5,
    validate(): ValidationResult {
      return validateGotifySettings(this);
    },
    ...overrides,
  };
}

/** Ported from FluentValidation's shared `IsValidUrl()` extension (also used by ntfy/apprise's validators) -- narrowed to the same http(s)-scheme `new URL()` check as `indexers/newznab/newznabSettings.ts`'s `isValidRootUrl`. */
function isValidUrl(value: string | null | undefined): boolean {
  if (!value || value.trim() === "") {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Ported from GotifySettingsValidator: `RuleFor(c => c.Server).IsValidUrl()`, `RuleFor(c => c.AppToken).NotEmpty()`. */
export function validateGotifySettings(settings: GotifySettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!isValidUrl(settings.server)) {
    errors.push({ propertyName: "Server", errorMessage: "Invalid URL" });
  }

  if (!settings.appToken || settings.appToken.trim() === "") {
    errors.push({ propertyName: "AppToken", errorMessage: "'App Token' must not be empty." });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
