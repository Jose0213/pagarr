import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";

/** Ported from NzbDrone.Core/Notifications/Ntfy/NtfySettings.cs's `private static List<string> InvalidTopics`. */
const INVALID_TOPICS = [
  "announcements",
  "app",
  "docs",
  "settings",
  "stats",
  "mytopic-rw",
  "mytopic-ro",
  "mytopic-wo",
];

/** Ported from NzbDrone.Core/Notifications/Ntfy/NtfySettings.cs. */
export interface NtfySettings extends IProviderConfig {
  serverUrl: string;
  accessToken: string;
  userName: string;
  password: string;
  priority: number;
  topics: string[];
  tags: string[];
  clickUrl: string;
}

/** Ported from NtfySettings's default ctor: `Topics = Array.Empty<string>()`, `Priority = 3`. */
export function createNtfySettings(overrides: Partial<NtfySettings> = {}): NtfySettings {
  return {
    serverUrl: "",
    accessToken: "",
    userName: "",
    password: "",
    priority: 3,
    topics: [],
    tags: [],
    clickUrl: "",
    validate(): ValidationResult {
      return validateNtfySettings(this);
    },
    ...overrides,
  };
}

/** Ported from FluentValidation's shared `IsValidUrl()` extension, matching gotify/GotifySettings.ts's own copy. */
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

const TOPIC_CHARS_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Ported from NtfySettingsValidator. Rule order/gating preserved exactly:
 * Topics non-empty; Priority in [1,5]; ServerUrl valid-URL only when
 * non-blank; ClickUrl valid-URL only when non-blank; UserName required
 * only when Password is set AND AccessToken is blank; Password required
 * only when UserName is set AND AccessToken is blank; each topic must be
 * non-empty, match `[a-zA-Z0-9_-]+`, and not be one of the reserved
 * ntfy.sh topic names.
 */
export function validateNtfySettings(settings: NtfySettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (settings.topics.length === 0) {
    errors.push({ propertyName: "Topics", errorMessage: "'Topics' must not be empty." });
  }

  if (settings.priority < 1 || settings.priority > 5) {
    errors.push({
      propertyName: "Priority",
      errorMessage: "'Priority' must be between 1 and 5.",
    });
  }

  if (settings.serverUrl && settings.serverUrl.trim() !== "" && !isValidUrl(settings.serverUrl)) {
    errors.push({ propertyName: "ServerUrl", errorMessage: "Invalid URL" });
  }

  if (settings.clickUrl && settings.clickUrl.trim() !== "" && !isValidUrl(settings.clickUrl)) {
    errors.push({ propertyName: "ClickUrl", errorMessage: "Invalid URL" });
  }

  const hasAccessToken = !!settings.accessToken && settings.accessToken.trim() !== "";
  const hasPassword = !!settings.password && settings.password.trim() !== "";
  const hasUserName = !!settings.userName && settings.userName.trim() !== "";

  if (hasPassword && !hasAccessToken && !hasUserName) {
    errors.push({ propertyName: "UserName", errorMessage: "'User Name' must not be empty." });
  }

  if (hasUserName && !hasAccessToken && !hasPassword) {
    errors.push({ propertyName: "Password", errorMessage: "'Password' must not be empty." });
  }

  for (const topic of settings.topics) {
    if (!topic || topic.trim() === "") {
      errors.push({ propertyName: "Topics", errorMessage: "'Topics' must not be empty." });
      continue;
    }

    if (!TOPIC_CHARS_REGEX.test(topic)) {
      errors.push({
        propertyName: "Topics",
        errorMessage: "'Topics' is not in the correct format.",
      });
    }

    if (INVALID_TOPICS.includes(topic)) {
      errors.push({ propertyName: "Topics", errorMessage: "Invalid topic" });
    }
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
