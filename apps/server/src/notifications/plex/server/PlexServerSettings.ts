import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../../thingi-provider/IProviderConfig.js";

/**
 * Ported from NzbDrone.Core/Notifications/Plex/Server/PlexServerSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function deviation
 * `download-clients/qbittorrent/QBittorrentSettings.ts`'s doc comment
 * documents -- ported as `validatePlexServerSettings()` returning this
 * module's own `ValidationResult`/`ValidationFailure` shape (reused from the
 * real, already-ported `thingi-provider/IProviderConfig.ts`, not a fourth
 * forward-ref copy).
 */
export interface PlexServerSettings extends IProviderConfig {
  host: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  authToken: string;
  signIn: string;
  updateLibrary: boolean;
  mapFrom: string;
  mapTo: string;
}

/** Ported from PlexServerSettings's default ctor (Port = 32400, UpdateLibrary = true, SignIn = "startOAuth"). */
export function createPlexServerSettings(
  overrides: Partial<PlexServerSettings> = {}
): PlexServerSettings {
  return {
    host: "",
    port: 32400,
    useSsl: false,
    urlBase: "",
    authToken: "",
    signIn: "startOAuth",
    updateLibrary: true,
    mapFrom: "",
    mapTo: "",
    validate(): ValidationResult {
      return validatePlexServerSettings(this);
    },
    ...overrides,
  };
}

/** Ported from ValidHost() -- non-empty host string, matching this port's established stand-in (see QBittorrentSettings.ts's isValidHost). */
function isValidHost(host: string | null | undefined): boolean {
  return host !== null && host !== undefined && host.trim() !== "";
}

/**
 * Ported from PlexServerSettingsValidator: Host must be valid, Port in
 * [1,65535], and MapFrom/MapTo are each required (NotEmpty) whenever the
 * *other* one is set (`.Unless(c => other.IsNullOrWhiteSpace())`) -- i.e.
 * both must be blank, or both must be non-blank.
 */
export function validatePlexServerSettings(settings: PlexServerSettings): ValidationResult {
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

  const mapFromBlank = !settings.mapFrom || settings.mapFrom.trim() === "";
  const mapToBlank = !settings.mapTo || settings.mapTo.trim() === "";

  if (mapFromBlank && !mapToBlank) {
    errors.push({ propertyName: "MapFrom", errorMessage: "'MapFrom' must not be empty." });
  }

  if (mapToBlank && !mapFromBlank) {
    errors.push({ propertyName: "MapTo", errorMessage: "'MapTo' must not be empty." });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
