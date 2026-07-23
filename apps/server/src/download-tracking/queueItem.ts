/**
 * RECONCILED at Phase 4 Wave 1 merge review: the real `Queue` module
 * (`NzbDrone.Core/Queue/Queue.cs`) has landed at `apps/server/src/queue/`.
 * This file used to be a local forward-ref stand-in copied field-for-field
 * from the real C# class (same pattern `decision-engine/queue.ts` still
 * uses for DecisionEngine's own narrower needs) -- now re-exports the real
 * type instead of redeclaring it, per this file's own original header
 * comment ("when Queue lands, this should be deleted in favor of importing
 * the real type").
 *
 * Shape differences resolved during the swap (pendingReleaseService.ts's
 * one construction site was updated to match): the real `QueueItem` widens
 * `downloadId`/`downloadClient`/`outputPath` to `string | null` (the C#
 * declared type is plain `string`, but `PendingReleaseService.
 * GetPendingQueue()`'s real object-initializer genuinely leaves
 * `DownloadId`/`OutputPath` unset -- C# reference types default to `null`
 * -- so the port's type needed to reflect that runtime reality, not just
 * the declared compile-time type; see queue/queue.ts's own doc comment on
 * those fields for the verification). `author`/`book`/`remoteBook`/
 * `quality` field nullability otherwise already matched.
 */
export type { QueueItem } from "../queue/queue.js";
