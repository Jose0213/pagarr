import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../indexers/IIndexerSettings.js";
import { SabnzbdPriority } from "./SabnzbdPriority.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation `indexers/newznab/newznabSettings.ts`'s doc comment documents.
 */
export interface SabnzbdSettings extends IProviderConfig {
  host: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  apiKey: string;
  username: string;
  password: string;
  musicCategory: string;
  recentTvPriority: number;
  olderTvPriority: number;
}

/** Ported from SabnzbdSettings's default ctor (Host = "localhost", Port = 8080, MusicCategory = "Readarr", both priorities = Default). */
export function createSabnzbdSettings(overrides: Partial<SabnzbdSettings> = {}): SabnzbdSettings {
  return {
    host: "localhost",
    port: 8080,
    useSsl: false,
    urlBase: "",
    apiKey: "",
    username: "",
    password: "",
    musicCategory: "Readarr",
    recentTvPriority: SabnzbdPriority.Default,
    olderTvPriority: SabnzbdPriority.Default,
    validate(): ValidationResult {
      return validateSabnzbdSettings(this);
    },
    ...overrides,
  };
}

function isValidHost(host: string | null | undefined): boolean {
  return host !== null && host !== undefined && host.trim() !== "";
}

function isValidUrlBase(urlBase: string | null | undefined): boolean {
  return (
    urlBase === null || urlBase === undefined || urlBase.trim() === "" || urlBase.startsWith("/")
  );
}

function isEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

/**
 * Ported from SabnzbdSettingsValidator. `MusicCategory` empty check is a
 * warning (`.AsWarning()`), matching this port's `isWarning: true` on that
 * failure.
 */
export function validateSabnzbdSettings(settings: SabnzbdSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!isValidHost(settings.host)) {
    errors.push({ propertyName: "Host", errorMessage: "Invalid host" });
  }

  if (settings.port < 1 || settings.port > 65535) {
    errors.push({
      propertyName: "Port",
      errorMessage: "'Port' must be between 1 and 65535",
    });
  }

  if (settings.urlBase && settings.urlBase.trim() !== "" && !isValidUrlBase(settings.urlBase)) {
    errors.push({ propertyName: "UrlBase", errorMessage: "Invalid URL base" });
  }

  if (isEmpty(settings.username) && isEmpty(settings.apiKey)) {
    errors.push({
      propertyName: "ApiKey",
      errorMessage: "API Key is required when username/password are not configured",
    });
  }

  if (isEmpty(settings.apiKey) && isEmpty(settings.username)) {
    errors.push({
      propertyName: "Username",
      errorMessage: "Username is required when API key is not configured",
    });
  }

  if (isEmpty(settings.apiKey) && isEmpty(settings.password)) {
    errors.push({
      propertyName: "Password",
      errorMessage: "Password is required when API key is not configured",
    });
  }

  if (isEmpty(settings.musicCategory)) {
    errors.push({
      propertyName: "MusicCategory",
      errorMessage: "A category is recommended",
      isWarning: true,
    });
  }

  return {
    isValid: !errors.some((f) => !f.isWarning),
    hasWarnings: errors.some((f) => f.isWarning),
    errors,
  };
}
