/**
 * Barrel export for the MediaCover module -- port of
 * NzbDrone.Core/MediaCover/*.cs. See this worktree's final report for
 * deviations: `IAppFolderInfo`/`IDiskProvider`/`SemaphoreSlim`/NLog
 * deviations (see `mediaCoverService.ts`'s doc comment), the new `sharp`
 * dependency (see `imageResizer.ts`'s doc comment), and the additive
 * `MediaCoverImage.extension` field added to `books/models.ts` (see that
 * file's doc comment and `mediaCoverService.ts`'s doc comment on the
 * sticky-extension behavior it restores).
 */

export * from "./mediaCover.js";
export * from "./coverAlreadyExistsSpecification.js";
export * from "./imageResizer.js";
export * from "./mediaCoverProxy.js";
export * from "./mediaCoversUpdatedEvent.js";
export * from "./mediaCoverService.js";
