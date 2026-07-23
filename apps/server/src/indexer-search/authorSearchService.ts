/**
 * Ported from NzbDrone.Core/IndexerSearch/AuthorSearchService.cs +
 * AuthorSearchCommand.cs.
 *
 * ## Deviations
 *
 * - `AuthorSearchCommand : Command` / `IExecute<AuthorSearchCommand>` (the
 *   Messaging.Commands command-bus dispatch pattern) has no bus to dispatch
 *   through in this repo yet -- Messaging is its own later-phase module.
 *   Following the exact precedent already established in this codebase
 *   (config/resetApiKeyCommand.ts's module doc comment), this is ported as
 *   a plain async function taking the command's one real field
 *   (`authorId`) plus the `userInvokedSearch` flag that the real
 *   `Execute()` derived from `message.Trigger == CommandTrigger.Manual`
 *   (CommandTrigger is Messaging-module infrastructure too -- the caller
 *   passes the boolean directly instead).
 * - No NLog `Logger` (see releaseSearchService.ts's module doc comment for
 *   the established precedent). `_logger.ProgressInfo(...)` is dropped;
 *   the function still returns the processed-decisions result so a caller
 *   can log/report it themselves.
 */

import type { IProcessDownloadDecisionsLike, ProcessedDecisions } from "./collaborators.js";
import type { ISearchForReleases } from "./releaseSearchService.js";

/**
 * Ported from AuthorSearchService.Execute(AuthorSearchCommand message):
 * search all indexers for the given author's monitored books, then run the
 * resulting release decisions through the download-decision processor.
 */
export async function authorSearchCommand(
  releaseSearchService: ISearchForReleases,
  processDownloadDecisions: IProcessDownloadDecisionsLike,
  authorId: number,
  userInvokedSearch: boolean
): Promise<ProcessedDecisions> {
  const decisions = await releaseSearchService.authorSearch(
    authorId,
    false,
    userInvokedSearch,
    false
  );
  return processDownloadDecisions.processDecisions(decisions);
}
