import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import { AppriseNotificationType } from "./AppriseNotificationType.js";

/** Ported from NzbDrone.Core/Notifications/Apprise/AppriseSettings.cs. */
export interface AppriseSettings extends IProviderConfig {
  serverUrl: string;
  configurationKey: string;
  statelessUrls: string;
  notificationType: number;
  tags: string[];
  authUsername: string;
  authPassword: string;
}

/** Ported from AppriseSettings's default ctor: `NotificationType = (int)AppriseNotificationType.Info`, `Tags = Array.Empty<string>()`. */
export function createAppriseSettings(overrides: Partial<AppriseSettings> = {}): AppriseSettings {
  return {
    serverUrl: "",
    configurationKey: "",
    statelessUrls: "",
    notificationType: AppriseNotificationType.Info,
    tags: [],
    authUsername: "",
    authPassword: "",
    validate(): ValidationResult {
      return validateAppriseSettings(this);
    },
    ...overrides,
  };
}

/** Ported from FluentValidation's shared `IsValidUrl()` extension, matching gotify/ntfy's own copies. */
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

const CONFIGURATION_KEY_REGEX = /^[a-z0-9-]*$/;

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === "";
}

/**
 * Ported from AppriseSettingsValidator. Rule order/gating preserved
 * exactly:
 *  - ServerUrl must be a valid URL (always checked, unconditional).
 *  - ConfigurationKey required (NotEmpty) only when StatelessUrls is
 *    blank; also always checked against the `^[a-z0-9-]*$` pattern
 *    regardless of whether StatelessUrls is set (that second rule has no
 *    `.When(...)` guard in the real C#).
 *  - StatelessUrls required (NotEmpty) only when ConfigurationKey is
 *    blank; must be Empty when ConfigurationKey is set (mutually
 *    exclusive).
 *  - Tags must be Empty when StatelessUrls is set (stateless mode doesn't
 *    support tags).
 */
export function validateAppriseSettings(settings: AppriseSettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!isValidUrl(settings.serverUrl)) {
    errors.push({ propertyName: "ServerUrl", errorMessage: "Invalid URL" });
  }

  const statelessBlank = isBlank(settings.statelessUrls);
  const configurationKeyBlank = isBlank(settings.configurationKey);

  if (statelessBlank && configurationKeyBlank) {
    errors.push({
      propertyName: "ConfigurationKey",
      errorMessage: "Use either Configuration Key or Stateless URLs",
    });
  }

  if (!CONFIGURATION_KEY_REGEX.test(settings.configurationKey ?? "")) {
    errors.push({
      propertyName: "ConfigurationKey",
      errorMessage: "Allowed characters a-z, 0-9 and -",
    });
  }

  if (configurationKeyBlank && statelessBlank) {
    errors.push({
      propertyName: "StatelessUrls",
      errorMessage: "Use either Configuration Key or Stateless URLs",
    });
  }

  if (!configurationKeyBlank && !statelessBlank) {
    errors.push({
      propertyName: "StatelessUrls",
      errorMessage: "Use either Configuration Key or Stateless URLs",
    });
  }

  if (!statelessBlank && settings.tags.length > 0) {
    errors.push({
      propertyName: "Tags",
      errorMessage: "Stateless URLs do not support tags",
    });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
