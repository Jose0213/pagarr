/**
 * Barrel export for the Notifications module -- shared base (port of
 * `NzbDrone.Core/Notifications/{NotificationBase,INotification,
 * NotificationFactory,NotificationService,NotificationRepository,
 * NotificationDefinition,NotificationStatus,NotificationStatusRepository,
 * NotificationStatusService,ApplicationUpdateMessage,AuthorDeleteMessage,
 * BookDeleteMessage,BookDownloadMessage,BookFileDeleteMessage,
 * BookRetagMessage,DownloadFailedMessage,GrabMessage}.cs`) plus every
 * per-notifier submodule as each lands and is reconciled against the real
 * base (see this module's own doc comments / PORT_PLAN.md for the full
 * per-notifier worktree breakdown).
 *
 * See `forwardRefs.ts` for this base module's own remaining forward-refs
 * (`HealthCheckResult`/`HealthCheckLike`/`HealthCheckFailedEventLike`,
 * `BookFileRetaggedEventLike`, `DeleteCompletedEventLike`,
 * `UpdateInstalledEventLike`).
 *
 * RECONCILED at Phase 4 Wave 2 merge review: the four notifier-group
 * worktrees (chat, push, media, mail-legacy) each independently built a
 * local forward-ref stand-in for this base, since they were ported in
 * parallel with this module and couldn't see it. Every notifier
 * subdirectory below has been re-pointed to import from the real exports
 * in this barrel, and every worktree's stand-in file has been deleted.
 */

export * from "./ApplicationUpdateMessage.js";
export * from "./AuthorDeleteMessage.js";
export * from "./BookDeleteMessage.js";
export * from "./BookDownloadMessage.js";
export * from "./BookFileDeleteMessage.js";
export * from "./BookRetagMessage.js";
export * from "./DownloadFailedMessage.js";
export * from "./GrabMessage.js";
export * from "./forwardRefs.js";

export * from "./INotification.js";
export * from "./NotificationBase.js";
export * from "./NotificationDefinition.js";
export * from "./NotificationFactory.js";
export * from "./NotificationRepository.js";
export * from "./NotificationStatus.js";
export * from "./NotificationStatusRepository.js";
export * from "./NotificationStatusService.js";
export * from "./NotificationService.js";
export * from "./ProcessProvider.js";

export * from "./discord/index.js";
export * from "./slack/index.js";
export * from "./telegram/index.js";
export * from "./signal/index.js";
export * from "./simplepush/index.js";

export * from "./customscript/index.js";
export * from "./kavita/index.js";
export * from "./plex/index.js";
export * from "./subsonic/index.js";
export * from "./synology/index.js";
export * from "./webhook/index.js";

export * from "./apprise/index.js";
export * from "./gotify/index.js";
export * from "./join/index.js";
export * from "./notifiarr/index.js";
export * from "./ntfy/index.js";
export * from "./prowl/index.js";
export * from "./pushbullet/index.js";
export * from "./pushover/index.js";

export * from "./email/index.js";
export * from "./mailgun/index.js";
export * from "./sendgrid/index.js";
export * from "./twitter/index.js";
export * from "./goodreads/index.js";
