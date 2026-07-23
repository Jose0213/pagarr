/**
 * Barrel export for the History module -- port of NzbDrone.Core/History/*.cs.
 *
 * NOTE for the reconciliation pass: `download-tracking/entityHistory.ts`
 * (Phase 3) and `decision-engine/history.ts` (Phase 2) both independently
 * forward-ref narrower slices of this exact module (see this module's final
 * report). Once merged, those two files' `EntityHistoryEventType`/
 * `EntityHistoryRecord`/`HistoryServiceLike` declarations should be deleted
 * in favor of importing this module's real `EntityHistory`/
 * `EntityHistoryEventType`/`IHistoryService` directly.
 */
export * from "./entityHistory.js";
export * from "./historyRepository.js";
export * from "./historyService.js";
