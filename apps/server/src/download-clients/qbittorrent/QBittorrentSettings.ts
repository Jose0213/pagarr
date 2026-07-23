import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../indexers/IIndexerSettings.js";
import { QBittorrentPriority } from "./QBittorrentPriority.js";
import { QBittorrentState } from "./QBittorrentState.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation `indexers/newznab/newznabSettings.ts`'s doc comment documents --
 * ported as `validateQBittorrentSettings()` returning this module's own
 * `ValidationResult`/`ValidationFailure` shape.
 */
export interface QBittorrentSettings extends IProviderConfig {
  host: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  username: string;
  password: string;
  musicCategory: string;
  musicImportedCategory: string;
  recentTvPriority: number;
  olderTvPriority: number;
  initialState: number;
  sequentialOrder: boolean;
  firstAndLast: boolean;
  contentLayout: number;
}

/** Ported from QBittorrentSettings's default ctor (Host = "localhost", Port = 8080, MusicCategory = "readarr"). */
export function createQBittorrentSettings(
  overrides: Partial<QBittorrentSettings> = {}
): QBittorrentSettings {
  return {
    host: "localhost",
    port: 8080,
    useSsl: false,
    urlBase: "",
    username: "",
    password: "",
    musicCategory: "readarr",
    musicImportedCategory: "",
    recentTvPriority: QBittorrentPriority.Last,
    olderTvPriority: QBittorrentPriority.Last,
    initialState: QBittorrentState.Start,
    sequentialOrder: false,
    firstAndLast: false,
    contentLayout: 0,
    validate(): ValidationResult {
      return validateQBittorrentSettings(this);
    },
    ...overrides,
  };
}

/** Ported from ValidHost() -- non-empty host string (a practical stand-in for the FluentValidation custom rule, same convention as newznabSettings.ts's isValidRootUrl). */
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
 * Ported from `Matches(@"^([^\\\/](\/?[^\\\/])*)?$")` -- category can't
 * contain `\`, can't contain `//`, and can't start/end with `/`.
 */
const CATEGORY_REGEX = /^([^\\/](\/?[^\\/])*)?$/;

/** Ported from QBittorrentSettingsValidator. */
export function validateQBittorrentSettings(settings: QBittorrentSettings): ValidationResult {
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

  if (!CATEGORY_REGEX.test(settings.musicCategory ?? "")) {
    errors.push({
      propertyName: "MusicCategory",
      errorMessage: `Can not contain '\\', '//', or start/end with '/'`,
    });
  }

  if (!CATEGORY_REGEX.test(settings.musicImportedCategory ?? "")) {
    errors.push({
      propertyName: "MusicImportedCategory",
      errorMessage: `Can not contain '\\', '//', or start/end with '/'`,
    });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
