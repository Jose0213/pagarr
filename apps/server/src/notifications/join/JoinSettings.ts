import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import { JoinPriority } from "./JoinPriority.js";

/**
 * Ported from NzbDrone.Core/Notifications/Join/JoinSettings.cs.
 * FluentValidation -> plain-function deviation, matching this port's
 * established convention (see e.g.
 * download-clients/qbittorrent/QBittorrentSettings.ts's doc comment).
 */
export interface JoinSettings extends IProviderConfig {
  apiKey: string;
  /** Deprecated field -- see validateJoinSettings() below (real rule requires this stay empty). */
  deviceIds: string;
  deviceNames: string;
  priority: number;
}

/** Ported from JoinSettings's default ctor: `Priority = (int)JoinPriority.Normal`. */
export function createJoinSettings(overrides: Partial<JoinSettings> = {}): JoinSettings {
  return {
    apiKey: "",
    deviceIds: "",
    deviceNames: "",
    priority: JoinPriority.Normal,
    validate(): ValidationResult {
      return validateJoinSettings(this);
    },
    ...overrides,
  };
}

/**
 * Ported from JoinSettingsValidator: `RuleFor(s => s.ApiKey).NotEmpty()`
 * and `RuleFor(s => s.DeviceIds).Empty().WithMessage("Use Device Names
 * instead")` -- DeviceIds is deprecated and must be left blank.
 */
export function validateJoinSettings(settings: JoinSettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push({ propertyName: "ApiKey", errorMessage: "'Api Key' must not be empty." });
  }

  if (settings.deviceIds && settings.deviceIds.trim() !== "") {
    errors.push({ propertyName: "DeviceIds", errorMessage: "Use Device Names instead" });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
