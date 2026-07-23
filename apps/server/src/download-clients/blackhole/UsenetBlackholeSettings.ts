import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../indexers/IIndexerSettings.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Blackhole/UsenetBlackholeSettings.cs.
 * Same `IsValidPath()` narrowing deviation as TorrentBlackholeSettings.ts's
 * doc comment.
 */
export interface UsenetBlackholeSettings extends IProviderConfig {
  nzbFolder: string;
  watchFolder: string;
}

export function createUsenetBlackholeSettings(
  overrides: Partial<UsenetBlackholeSettings> = {}
): UsenetBlackholeSettings {
  return {
    nzbFolder: "",
    watchFolder: "",
    validate(): ValidationResult {
      return validateUsenetBlackholeSettings(this);
    },
    ...overrides,
  };
}

function isValidPath(path: string | null | undefined): boolean {
  return path !== null && path !== undefined && path.trim() !== "";
}

/** Ported from UsenetBlackholeSettingsValidator. */
export function validateUsenetBlackholeSettings(
  settings: UsenetBlackholeSettings
): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!isValidPath(settings.nzbFolder)) {
    errors.push({ propertyName: "NzbFolder", errorMessage: "Invalid path" });
  }

  if (!isValidPath(settings.watchFolder)) {
    errors.push({ propertyName: "WatchFolder", errorMessage: "Invalid path" });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
