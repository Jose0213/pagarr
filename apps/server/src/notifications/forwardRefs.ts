import type { Author } from "../books/models.js";
import type { BookFile } from "../media-files-import/bookFile.js";

/**
 * Forward-references for modules the real C# NotificationService.cs/
 * NotificationFactory.cs depend on that are NOT ported anywhere in this
 * repo yet -- confirmed by full-tree search before writing this file (see
 * this module's final report). Every shape below is copied 1:1 (field
 * names, types) from the real C# classes cited in each doc comment,
 * narrowed to only what NotificationService's own source reads. When the
 * real modules land, these should be deleted in favor of importing the real
 * types -- shapes were kept faithful specifically so that swap is
 * mechanical, matching the pattern `extras/forwardRefs.ts` established for
 * the exact same situation.
 */

// ---- HealthCheck/HealthCheck.cs, HealthCheck/Events/HealthCheckFailedEvent.cs ----

/**
 * Forward-ref for NzbDrone.Core/HealthCheck/HealthCheck.cs's
 * `HealthCheckResult` enum. No `HealthCheck` module exists anywhere in this
 * port yet (confirmed by full-tree search).
 */
export enum HealthCheckResult {
  Ok = 0,
  Notice = 1,
  Warning = 2,
  Error = 3,
}

/**
 * Forward-ref for the slice of NzbDrone.Core/HealthCheck/HealthCheck.cs
 * `INotification.OnHealthIssue`/`NotificationService.ShouldHandleHealthFailure`
 * read: `Type`/`Message`, plus `Source.Name` and `WikiUrl` -- widened during
 * Phase 4 Wave 2 merge-review reconciliation once the chat/push/media
 * notifier groups landed and several concrete `OnHealthIssue` overrides
 * turned out to need more than the base module's original narrow slice:
 * `discord/Discord.ts`/`slack/Slack.ts` read `healthCheck.Source.Name` for
 * their embed/attachment title, and `customscript/CustomScript.ts` reads
 * both `healthCheck.Source.Name` and `healthCheck.WikiUrl` to populate
 * `Readarr_Health_Issue_Type`/`Readarr_Health_Issue_Wiki` env vars (see
 * CustomScript.cs's `OnHealthIssue`). `Source` is a reflection `Type` in C#;
 * narrowed here to `{ name: string }` since no ported call site reads
 * anything else off it. `WikiUrl` is a `HttpUri` in C# (`.ToString()`'d at
 * every read site); ported as a plain `string | null` matching this port's
 * established BCL-URI-to-string substitution (see
 * `ApplicationUpdateMessage.ts`'s doc comment for the same pattern applied
 * to `System.Version`).
 */
export interface HealthCheckLike {
  id: number;
  type: HealthCheckResult;
  message: string;
  source: { name: string };
  wikiUrl: string | null;
}

/**
 * Forward-ref for NzbDrone.Core/HealthCheck/Events/HealthCheckFailedEvent.cs.
 */
export interface HealthCheckFailedEventLike {
  healthCheck: HealthCheckLike;
  isInStartupGracePeriod: boolean;
}

// ---- MediaFiles/Events/BookFileRetaggedEvent.cs ----

/**
 * Forward-ref for NzbDrone.Core/MediaFiles/Events/BookFileRetaggedEvent.cs.
 * `diff`'s `Dictionary<string, Tuple<string, string>>` is ported as
 * `Record<string, [string, string]>` -- see `BookRetagMessage.ts`'s doc
 * comment for the same substitution.
 */
export interface BookFileRetaggedEventLike {
  author: Author;
  bookFile: BookFile;
  diff: Record<string, [string, string]>;
  scrubbed: boolean;
}

// ---- MediaFiles/Events/DeleteCompletedEvent.cs ----

/**
 * Forward-ref for NzbDrone.Core/MediaFiles/Events/DeleteCompletedEvent.cs --
 * an empty marker event (`IEvent` with no members) that triggers
 * `NotificationService.ProcessQueue()` via `IHandleAsync<DeleteCompletedEvent>`.
 */
export type DeleteCompletedEventLike = Record<string, never>;

// ---- Update/Events/UpdateInstalledEvent.cs ----

/**
 * Forward-ref for NzbDrone.Core/Update/Events/UpdateInstalledEvent.cs.
 * C#'s `Version` (System.Version) is ported as a plain dotted-version
 * `string` -- see `ApplicationUpdateMessage.ts`'s doc comment for the same
 * substitution. Field name `previousVersion` intentionally does NOT
 * reproduce the real C# source's `PreviousVerison` typo (see this module's
 * final report -- the typo is preserved as a documented quirk, not
 * replicated into this port's own field name, since nothing outside this
 * one class depends on the misspelled name and TS gives no reflection-based
 * reason to keep it byte-for-byte).
 */
export interface UpdateInstalledEventLike {
  previousVersion: string;
  newVersion: string;
}
