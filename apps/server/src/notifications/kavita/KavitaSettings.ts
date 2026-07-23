import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";

/**
 * Ported from NzbDrone.Core/Notifications/Kavita/KavitaSettings.cs.
 * DEVIATION -- validation: same FluentValidation-to-plain-function deviation
 * as this module's other settings ports.
 */
export interface KavitaSettings extends IProviderConfig {
  host: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  notify: boolean;
}

/** Ported from KavitaSettings's default ctor (Port = 4040). */
export function createKavitaSettings(overrides: Partial<KavitaSettings> = {}): KavitaSettings {
  return {
    host: "",
    port: 4040,
    apiKey: "",
    useSsl: false,
    notify: false,
    validate(): ValidationResult {
      return validateKavitaSettings(this);
    },
    ...overrides,
  };
}

function isValidHost(host: string | null | undefined): boolean {
  return host !== null && host !== undefined && host.trim() !== "";
}

/** Ported from KavitaSettingsValidator: Host valid, Port in [1,65535], ApiKey required (NotEmpty). */
export function validateKavitaSettings(settings: KavitaSettings): ValidationResult {
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

  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push({ propertyName: "ApiKey", errorMessage: "'Api Key' must not be empty." });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
