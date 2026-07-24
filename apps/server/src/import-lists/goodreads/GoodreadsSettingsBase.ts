/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/GoodreadsSettingsBase.cs.
 *
 * LIVE-SERVICE STATUS -- DEAD, THE SAME DEAD GOODREADS DEVELOPER API AS THE
 * OTHER TWO GOODREADS TOUCHPOINTS ALREADY FOUND IN THIS PROJECT'S HISTORY:
 *
 *  1. `metadata-source/`'s Goodreads *read* client (Phase 2,
 *     `docs/known-issues-fixlist.md` #1) -- deliberately NOT ported at all,
 *     replaced by Hardcover/OpenLibrary/Google Books.
 *  2. `notifications/goodreads/`'s Goodreads *write* (shelf-sync)
 *     notification (Phase 4 Wave 2) -- ported faithfully, flagged dead in
 *     that module's own `GoodreadsSettingsBase.ts` doc comment.
 *  3. THIS module (`import-lists/goodreads/`) -- a THIRD, independent
 *     integration point: Goodreads as an *import list source* (sync a
 *     user's bookshelf/owned-books/a public list/a series into Pagarr's
 *     wanted list). Every URL this sub-module's concrete providers hit
 *     (`www.goodreads.com/oauth/*`, `api/auth_user`, `shelf/list.xml`,
 *     `review/list.xml`, `owned_books/user`, plus whatever `list/show` and
 *     `series/show` endpoints the List/Series sub-integrations use) is the
 *     exact same Goodreads Developer API that stopped issuing new API keys
 *     in December 2020 and has never reopened -- unusable for any new
 *     Pagarr install regardless of which of these three touchpoints is
 *     exercised. This is the third and final confirmation: the Goodreads
 *     Developer API is dead across all of Readarr's independent
 *     integrations with it, not a one-off.
 *
 * `SigningUrl` (`https://auth.servarr.com/v1/goodreads/sign`) is the same
 * Servarr-operated OAuth-signing proxy `notifications/goodreads/` already
 * documented -- unverified from this worktree whether it's still alive, and
 * moot either way since it can only proxy requests against the dead
 * underlying Goodreads API.
 *
 * Ported faithfully anyway per this project's standing practice (port
 * faithfully, document deadness, don't skip) -- flagged prominently here
 * and in this worktree's final report.
 */
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import type { IImportListSettings } from "../IImportListSettings.js";

/**
 * Ported from `GoodreadsSettingsBase<TSettings> : IImportListSettings`.
 * `BaseUrl` comes from the REAL `IImportListSettings` (per this module's
 * task brief) -- C#'s `GoodreadsSettingsBase` never actually assigns it a
 * value (no `BaseUrl = ...` in its parameterless ctor, unlike
 * `GoodreadsListImportListSettings`/`GoodreadsSeriesImportListSettings`,
 * both of which default it to `"www.goodreads.com"` -- see those files'
 * ports), so it's left at `IImportListSettings`'s own default (empty
 * string) here too, faithfully preserving that (likely-unintentional)
 * inconsistency between the OAuth-based Goodreads settings and the
 * ID-based ones.
 */
export interface GoodreadsSettingsBase extends IImportListSettings {
  signIn: string;
  readonly signingUrl: string;
  readonly oAuthUrl: string;
  readonly oAuthRequestTokenUrl: string;
  readonly oAuthAccessTokenUrl: string;

  accessToken: string | null;
  accessTokenSecret: string | null;
  requestTokenSecret: string | null;
  userId: string | null;
  userName: string | null;
}

const SIGNING_URL = "https://auth.servarr.com/v1/goodreads/sign";
const OAUTH_URL = "https://www.goodreads.com/oauth/authorize";
const OAUTH_REQUEST_TOKEN_URL = "https://www.goodreads.com/oauth/request_token";
const OAUTH_ACCESS_TOKEN_URL = "https://www.goodreads.com/oauth/access_token";

/**
 * Ported from `GoodreadsSettingsBase()`'s ctor (`SignIn = "startOAuth"`)
 * plus the four read-only URL properties. `validate` is left for the
 * concrete subclass to supply, matching
 * `GoodreadsSettingsBaseValidator<TSettings>`'s two required rules
 * (`AccessToken`/`AccessTokenSecret` not empty) plus any subclass-specific
 * rules layered on top.
 */
export function createGoodreadsSettingsBaseFields(): Omit<GoodreadsSettingsBase, "validate"> {
  return {
    baseUrl: "",
    signIn: "startOAuth",
    signingUrl: SIGNING_URL,
    oAuthUrl: OAUTH_URL,
    oAuthRequestTokenUrl: OAUTH_REQUEST_TOKEN_URL,
    oAuthAccessTokenUrl: OAUTH_ACCESS_TOKEN_URL,
    accessToken: null,
    accessTokenSecret: null,
    requestTokenSecret: null,
    userId: null,
    userName: null,
  };
}

/** Ported from `GoodreadsSettingsBaseValidator<TSettings>`'s two base rules (`AccessToken`/`AccessTokenSecret` NotEmpty). */
export function validateGoodreadsSettingsBase(
  settings: GoodreadsSettingsBase
): ValidationFailure[] {
  const errors: ValidationFailure[] = [];

  if (!settings.accessToken) {
    errors.push({ propertyName: "accessToken", errorMessage: "'Access Token' must not be empty." });
  }

  if (!settings.accessTokenSecret) {
    errors.push({
      propertyName: "accessTokenSecret",
      errorMessage: "'Access Token Secret' must not be empty.",
    });
  }

  return errors;
}

export function toValidationResult(errors: ValidationFailure[]): ValidationResult {
  return { isValid: errors.filter((e) => !e.isWarning).length === 0, hasWarnings: false, errors };
}
