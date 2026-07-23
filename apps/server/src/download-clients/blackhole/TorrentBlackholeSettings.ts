import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../indexers/IIndexerSettings.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Blackhole/TorrentBlackholeSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation `indexers/newznab/newznabSettings.ts`'s doc comment documents.
 * `IsValidPath()` (from the not-yet-ported `NzbDrone.Core.Validation.Paths`
 * namespace) is ported as a minimal "non-empty" check -- the real validator
 * additionally checks the path is rooted/exists on the host filesystem,
 * which isn't practical to replicate faithfully without that module; a
 * non-empty check is the one piece of that rule this module's own
 * `TestFolder()` (DownloadClientBase.ts) doesn't already separately cover at
 * connection-test time.
 */
export interface TorrentBlackholeSettings extends IProviderConfig {
  torrentFolder: string;
  watchFolder: string;
  saveMagnetFiles: boolean;
  magnetFileExtension: string;
  readOnly: boolean;
}

/** Ported from TorrentBlackholeSettings's default ctor (MagnetFileExtension = ".magnet", ReadOnly = true). */
export function createTorrentBlackholeSettings(
  overrides: Partial<TorrentBlackholeSettings> = {}
): TorrentBlackholeSettings {
  return {
    torrentFolder: "",
    watchFolder: "",
    saveMagnetFiles: false,
    magnetFileExtension: ".magnet",
    readOnly: true,
    validate(): ValidationResult {
      return validateTorrentBlackholeSettings(this);
    },
    ...overrides,
  };
}

function isValidPath(path: string | null | undefined): boolean {
  return path !== null && path !== undefined && path.trim() !== "";
}

/** Ported from TorrentBlackholeSettingsValidator. */
export function validateTorrentBlackholeSettings(
  settings: TorrentBlackholeSettings
): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!isValidPath(settings.torrentFolder)) {
    errors.push({ propertyName: "TorrentFolder", errorMessage: "Invalid path" });
  }

  if (!settings.magnetFileExtension || settings.magnetFileExtension.trim() === "") {
    errors.push({ propertyName: "MagnetFileExtension", errorMessage: "Must not be empty" });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
