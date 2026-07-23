import type { RemoteBook } from "../decision-engine/remoteBook.js";

/**
 * Ported from NzbDrone.Core/Download/BookGrabbedEvent.cs. `book` uses
 * DecisionEngine's `RemoteBook` (not Parser's) since this event is
 * published by `DownloadService.DownloadReport(RemoteBook remoteBook, ...)`,
 * whose `remoteBook` parameter flows in from `DownloadDecision.RemoteBook`
 * (DecisionEngine's real, ported type -- see downloadService.ts's doc
 * comment for the full chain).
 */
export class BookGrabbedEvent {
  downloadClientId = 0;
  downloadClient: string | null = null;
  downloadClientName: string | null = null;
  downloadId: string | null = null;

  constructor(public readonly book: RemoteBook) {}
}
