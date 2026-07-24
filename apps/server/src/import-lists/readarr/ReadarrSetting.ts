import type { ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { IImportListSettings } from "../IImportListSettings.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Readarr/ReadarrSetting.cs
 * (class name `ReadarrSettings`, file name singular -- matches the C#
 * source's own file/class naming mismatch).
 *
 * LIVE-SERVICE STATUS: LIVE IN PRINCIPLE. This calls another
 * Readarr/Pagarr instance's own `Readarr.Api.V1` REST surface (see
 * `ReadarrV1Proxy.ts`) -- self-consistent with the real API surface once
 * built, since it's the same kind of application calling itself. AS OF
 * THIS WORKTREE: the target endpoints
 * (`/api/v1/author`, `/api/v1/book`, `/api/v1/qualityprofile`,
 * `/api/v1/rootfolder`, `/api/v1/tag`) do NOT yet exist in this Pagarr
 * port's own `http-api/` composition root (confirmed: no author/book/
 * qualityprofile/rootfolder/tag controllers exist there as of this
 * worktree's branch point) -- Phase 5's sibling API-controller worktrees are
 * building that layer in parallel. This provider is fully forward-compatible
 * with those endpoints once they land; nothing about this integration is
 * dead or deprecated, it's just pointed at a target surface this port
 * hasn't finished building yet.
 */
export interface ReadarrSettings extends IImportListSettings {
  apiKey: string;
  profileIds: number[];
  tagIds: number[];
  rootFolderPaths: string[];
}

/** Ported from `ReadarrSettings()`'s ctor. */
export function createReadarrSettings(overrides: Partial<ReadarrSettings> = {}): ReadarrSettings {
  return {
    baseUrl: "",
    apiKey: "",
    profileIds: [],
    tagIds: [],
    rootFolderPaths: [],
    validate(): ValidationResult {
      return validateReadarrSettings(this);
    },
    ...overrides,
  };
}

/**
 * Ported from `ReadarrSettingsValidator`: `RuleFor(c => c.BaseUrl).ValidRootUrl()`,
 * `RuleFor(c => c.ApiKey).NotEmpty()`.
 */
export function validateReadarrSettings(settings: ReadarrSettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!isValidRootUrl(settings.baseUrl)) {
    errors.push({ propertyName: "baseUrl", errorMessage: "'Full URL' is not a valid URL." });
  }

  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push({ propertyName: "apiKey", errorMessage: "'API Key' must not be empty." });
  }

  return { isValid: errors.length === 0, hasWarnings: false, errors };
}

function isValidRootUrl(url: string | null | undefined): boolean {
  if (!url || url.trim() === "") {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
