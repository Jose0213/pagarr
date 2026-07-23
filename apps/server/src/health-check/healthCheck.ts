import { HttpUri } from "../http/index.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/HealthCheck.cs.
 *
 * C#'s `HealthCheck : ModelBase` has a `Type Source` property holding the
 * .NET reflection `Type` of whichever `IProvideHealthCheck` produced it --
 * used both as a stable identity key (`Source.Name`, see HealthCheckService's
 * `_healthCheckResults` cache, keyed by that name) and to instantiate the
 * "type" tag surfaced to the UI. TypeScript has no reflection `Type` object;
 * this port uses the check's *constructor function* (`HealthCheckSource`) as
 * the direct analog -- same role `messaging/events/eventAggregator.ts`'s
 * `EventCtor<TEvent>` plays for event identity (see that file's doc comment
 * "Event identity" section) -- and derives the display name from
 * `source.name` (a real, always-present JS class-constructor property)
 * wherever C# used `Source.Name`.
 *
 * `CleanFragmentRegex` (`[^a-z ]`, applied to a *lowercased* message) has no
 * named capture groups, so it's a direct, safe port -- see
 * apps/server/scripts/check-regex-compat.mjs's rationale for why that
 * matters in this codebase specifically.
 */

const CLEAN_FRAGMENT_REGEX = /[^a-z ]/g;

/** Ported from NzbDrone.Core/HealthCheck/HealthCheck.cs's `HealthCheckResult` enum. Values match the C# enum's underlying ints for parity with the `HealthCheckFailedEvent`/UI severity ordering. */
export enum HealthCheckResult {
  Ok = 0,
  Notice = 1,
  Warning = 2,
  Error = 3,
}

/** Any health-check class's constructor -- the port's analog of C#'s reflection `Type`. See module doc comment. */
export type HealthCheckSource = new (...args: never[]) => unknown;

export interface HealthCheck {
  id: number;
  source: HealthCheckSource;
  type: HealthCheckResult;
  message: string | null;
  wikiUrl: HttpUri | null;
}

/** Ported from `HealthCheck()` (default ctor, used by ModelBase machinery) and `HealthCheck(Type source)` (implicit Ok result). */
export function createOkHealthCheck(source: HealthCheckSource): HealthCheck {
  return {
    id: 0,
    source,
    type: HealthCheckResult.Ok,
    message: null,
    wikiUrl: null,
  };
}

/**
 * Ported from `HealthCheck(Type source, HealthCheckResult type, string
 * message, string wikiFragment = null)`. `wikiFragment` defaults to a
 * lowercased, `[^a-z ]`-stripped, space-to-hyphen slug of `message` when not
 * given explicitly -- ported faithfully via `makeWikiFragment`.
 */
export function createHealthCheck(
  source: HealthCheckSource,
  type: HealthCheckResult,
  message: string,
  wikiFragment?: string | null
): HealthCheck {
  return {
    id: 0,
    source,
    type,
    message,
    wikiUrl: makeWikiUrl(wikiFragment ?? makeWikiFragment(message)),
  };
}

function makeWikiFragment(message: string): string {
  return "#" + message.toLowerCase().replace(CLEAN_FRAGMENT_REGEX, "").replace(/ /g, "-");
}

function makeWikiUrl(fragment: string): HttpUri {
  // Ported from `new HttpUri("https://wiki.servarr.com/readarr/system#") + new HttpUri(fragment)` --
  // C#'s HttpUri.operator+ concatenates the raw string forms. `fragment`
  // already includes its own leading "#" (either passed in explicitly by a
  // caller, e.g. RootFolderCheck's "#missing-root-folder", or produced by
  // makeWikiFragment above), so simple string concatenation reproduces the
  // same double-"#"-avoiding shape the C# operator+ produces in practice.
  return new HttpUri("https://wiki.servarr.com/readarr/system#" + fragment.replace(/^#/, ""));
}

/** Ported from HealthCheck's implicit `Source.Name` display-name usage throughout the module (e.g. `_healthCheckResults` cache keys, `HealthCheckFailedEvent` consumers). */
export function healthCheckSourceName(source: HealthCheckSource): string {
  return source.name;
}
