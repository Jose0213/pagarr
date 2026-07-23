import type { Author } from "../books/models.js";
import type { QualityModel } from "../qualities/qualityModel.js";
import type { RemoteBook } from "../parser/model/remoteBook.js";

/**
 * Ported from NzbDrone.Core/Notifications/GrabMessage.cs.
 *
 * `remoteBook` uses Parser's real, canonical `RemoteBook`
 * (`parser/model/remoteBook.ts`) rather than DecisionEngine's own forward-ref
 * copy (`decision-engine/remoteBook.ts`, used by
 * `download-tracking/bookGrabbedEvent.ts`'s `BookGrabbedEvent.book`) -- the
 * two are structurally near-identical (both carry `release`/`parsedBookInfo`/
 * `author`/`books`/`downloadAllowed`/`customFormats`/`customFormatScore`/
 * `releaseSource`) but are declared in different files with no shared
 * identity. Parser's copy is picked here as the canonical one for this
 * module's own field (Parser is the module that actually owns
 * `NzbDrone.Core/Parser/Model/RemoteBook.cs` in the real source tree); a
 * caller constructing a `GrabMessage` from a `BookGrabbedEvent` needs to
 * adapt between the two shapes (structurally compatible, so a simple object
 * literal/spread suffices) until a merge-time reconciliation picks one
 * `RemoteBook` as the single canonical type across modules.
 */
export interface GrabMessage {
  message: string;
  author: Author | null;
  remoteBook: RemoteBook | null;
  quality: QualityModel | null;
  downloadClientType: string | null;
  downloadClientName: string | null;
  downloadId: string | null;
}

/** Ported from `GrabMessage.ToString()`. */
export function grabMessageToString(message: GrabMessage): string {
  return message.message;
}
