import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";

/**
 * Ported from NzbDrone.Core/Notifications/Subsonic/SubsonicSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function deviation
 * as `notifications/plex/server/PlexServerSettings.ts` -- see that file's
 * doc comment.
 */
export interface SubsonicSettings extends IProviderConfig {
  host: string;
  port: number;
  urlBase: string;
  username: string;
  password: string;
  notify: boolean;
  updateLibrary: boolean;
  useSsl: boolean;
}

/** Ported from SubsonicSettings's default ctor (Port = 4040). */
export function createSubsonicSettings(
  overrides: Partial<SubsonicSettings> = {}
): SubsonicSettings {
  return {
    host: "",
    port: 4040,
    urlBase: "",
    username: "",
    password: "",
    notify: false,
    updateLibrary: false,
    useSsl: false,
    validate(): ValidationResult {
      return validateSubsonicSettings(this);
    },
    ...overrides,
  };
}

function isValidHost(host: string | null | undefined): boolean {
  return host !== null && host !== undefined && host.trim() !== "";
}

/** Ported from ValidUrlBase(): empty is fine, otherwise must start with "/". */
function isValidUrlBase(urlBase: string | null | undefined): boolean {
  return (
    urlBase === null || urlBase === undefined || urlBase.trim() === "" || urlBase.startsWith("/")
  );
}

/**
 * Ported from SubsonicSettingsValidator: Host must be valid, Port in
 * [1,65535], UrlBase validated only `.When(UrlBase.IsNotNullOrWhiteSpace())`
 * (i.e. blank UrlBase is never validated/flagged).
 */
export function validateSubsonicSettings(settings: SubsonicSettings): ValidationResult {
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

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
