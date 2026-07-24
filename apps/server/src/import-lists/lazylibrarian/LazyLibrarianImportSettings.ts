import type { ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { IImportListSettings } from "../IImportListSettings.js";

/**
 * Ported from NzbDrone.Core/ImportLists/LazyLibrarian/LazyLibrarianImportSettings.cs.
 *
 * LIVE-SERVICE STATUS: LIVE IN PRINCIPLE, UNLIKE THE GOODREADS SUB-MODULE.
 * LazyLibrarian is a sibling *arr-family book manager, still an actively
 * maintained open-source project (github.com/LazyLibrarian, no shutdown/
 * deprecation comparable to Goodreads' Developer API closure). This
 * provider calls LazyLibrarian's OWN self-hosted HTTP API
 * (`{BaseUrl}/api?cmd=getAllBooks&apikey={ApiKey}` -- see
 * `LazyLibrarianImportRequestGenerator.ts`), not a third-party service that
 * could be independently deprecated out from under this integration -- as
 * long as a user's own LazyLibrarian instance is reachable and its
 * `getAllBooks` API command still returns this same JSON array shape
 * (`[{BookName, BookId, BookIsbn, AuthorName, AuthorId}, ...]`, unverified
 * against LazyLibrarian's current source from this worktree -- no network
 * access -- but no evidence of an API contract break either), this
 * integration should work end-to-end today. Ported faithfully with no
 * deadness caveats.
 */
export interface LazyLibrarianImportSettings extends IImportListSettings {
  apiKey: string;
}

/** Ported from `LazyLibrarianImportSettings()`'s ctor (`BaseUrl = "http://localhost:5299"`). */
export function createLazyLibrarianImportSettings(
  overrides: Partial<LazyLibrarianImportSettings> = {}
): LazyLibrarianImportSettings {
  return {
    baseUrl: "http://localhost:5299",
    apiKey: "",
    validate(): ValidationResult {
      return validateLazyLibrarianImportSettings(this);
    },
    ...overrides,
  };
}

/**
 * Ported from `LazyLibrarianImportSettingsValidator`:
 * `RuleFor(c => c.BaseUrl).IsValidUrl()`, `RuleFor(c => c.ApiKey).NotEmpty()`.
 */
export function validateLazyLibrarianImportSettings(
  settings: LazyLibrarianImportSettings
): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!isValidUrl(settings.baseUrl)) {
    errors.push({ propertyName: "baseUrl", errorMessage: "'Url' is not a valid URL." });
  }

  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push({ propertyName: "apiKey", errorMessage: "'API Key' must not be empty." });
  }

  return { isValid: errors.length === 0, hasWarnings: false, errors };
}

function isValidUrl(url: string | null | undefined): boolean {
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
