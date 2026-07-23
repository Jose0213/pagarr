/**
 * Ported from NzbDrone.Core/Notifications/Goodreads/GoodreadsSettingsBase.cs.
 *
 * LIVE-SERVICE STATUS -- DEAD, SAME AS THE METADATA-SOURCE GOODREADS CLIENT:
 * this is Readarr's own webhook-style notification integration TO
 * Goodreads (distinct from the already-evaluated-dead MetadataSource
 * Goodreads *read* client -- see `docs/known-issues-fixlist.md` #1). Every
 * URL below (`www.goodreads.com/oauth/*`, and -- see `GoodreadsNotificationBase.ts`
 * -- `www.goodreads.com/api/auth_user`, `shelf/list.xml`, `review/list.xml`,
 * `shelf/add_to_shelf.xml`, `shelf/add_books_to_shelves.xml`,
 * `owned_books.xml`) hits the same public Goodreads Developer API that
 * Goodreads (a subsidiary of Amazon) stopped issuing new API keys for in
 * December 2020 and has never reopened. Existing previously-issued API keys
 * reportedly continued to function for some time after the Dec 2020
 * cutoff, but the API has no path for a *new* Pagarr install to obtain a
 * `ConsumerKey`/`ConsumerSecret` pair at all -- so this whole integration
 * is unusable for any new setup, and increasingly likely to be fully dead
 * (not just closed to new signups) as Goodreads continues deprecating
 * legacy infrastructure. Ported faithfully anyway per this project's
 * standing practice (port faithfully, document deadness, don't skip) --
 * flagged prominently here and in this worktree's final report.
 *
 * `SigningUrl` (`https://auth.servarr.com/v1/goodreads/sign`) is a
 * Servarr-family-operated OAuth-signing proxy (the actual HMAC-SHA1 signing
 * of the *initial* request-token step is delegated server-side to Servarr's
 * own infra rather than done client-side -- see `GoodreadsNotificationBase.
 * GetAuthorizationHeader`). Whether that specific proxy endpoint is itself
 * still alive is unverified from this worktree (no network access); even if
 * it is, it can only proxy requests against the underlying dead Goodreads
 * API, so the end-to-end integration is dead either way.
 */
import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";

export interface GoodreadsSettingsBase extends IProviderConfig {
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
 * Ported from GoodreadsSettingsBase's parameterless constructor (`SignIn =
 * "startOAuth"`) plus the four read-only URL properties. `validate` is left
 * for the concrete subclass to supply (C#'s `abstract
 * NzbDroneValidationResult Validate()`), matching
 * `GoodreadsSettingsBaseValidator<TSettings>`'s two required rules
 * (`AccessToken`/`AccessTokenSecret` not empty) plus any subclass-specific
 * rules layered on top.
 */
export function createGoodreadsSettingsBaseFields(): Omit<GoodreadsSettingsBase, "validate"> {
  return {
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

/** Ported from GoodreadsSettingsBase.IsValid => !string.IsNullOrWhiteSpace(AccessTokenSecret). */
export function isGoodreadsSettingsValid(settings: GoodreadsSettingsBase): boolean {
  return !!settings.accessTokenSecret && settings.accessTokenSecret.trim() !== "";
}

/** Ported from GoodreadsSettingsBaseValidator<TSettings>'s two base rules. */
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
