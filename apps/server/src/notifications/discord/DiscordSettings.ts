import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/index.js";

/**
 * Ported from NzbDrone.Core/Notifications/Discord/DiscordSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation `download-clients/qbittorrent/QBittorrentSettings.ts`'s doc
 * comment documents -- ported as `validateDiscordSettings()` returning this
 * module's own `ValidationResult`/`ValidationFailure` shape. `IsValidUrl`
 * (a `NzbDrone.Common.Extensions.UrlExtensions` custom FluentValidation
 * rule) is ported directly as `isValidUrl()` below: non-empty, no leading
 * or trailing whitespace, and parseable as an absolute, well-formed URI
 * (see UrlExtensions.cs -- `Uri.TryCreate(path, UriKind.Absolute, ...) &&
 * uri.IsWellFormedOriginalString()`). Node's `URL` constructor throwing is
 * the practical equivalent of `Uri.TryCreate` failing; well-formedness
 * beyond "is a syntactically valid absolute URL" isn't independently
 * checked since `URL` already normalizes/rejects malformed input at parse
 * time.
 */
export interface DiscordSettings extends IProviderConfig {
  webHookUrl: string;
  username: string;
  avatar: string;
  /** Ported from `Author` field -- "Override the Host that shows for this notification, Blank is machine name". Kept as-is (odd C# field name vs. label) for fidelity. */
  author: string;
}

export function createDiscordSettings(overrides: Partial<DiscordSettings> = {}): DiscordSettings {
  return {
    webHookUrl: "",
    username: "",
    avatar: "",
    author: "",
    validate(): ValidationResult {
      return validateDiscordSettings(this);
    },
    ...overrides,
  };
}

/** Ported from `NzbDrone.Common.Extensions.UrlExtensions.IsValidUrl()`. */
export function isValidUrl(path: string | null | undefined): boolean {
  if (path === null || path === undefined || path.trim() === "") {
    return false;
  }

  if (path.startsWith(" ") || path.endsWith(" ")) {
    return false;
  }

  try {
    new URL(path);
    return true;
  } catch {
    return false;
  }
}

/** Ported from DiscordSettingsValidator. */
export function validateDiscordSettings(settings: DiscordSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!isValidUrl(settings.webHookUrl)) {
    errors.push({
      propertyName: "WebHookUrl",
      errorMessage: `Invalid Url: '${settings.webHookUrl}'`,
    });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
