import { Command } from "../../../messaging/commands/command.js";

/**
 * Ported from NzbDrone.Core/Books/Commands/{MoveAuthorCommand,
 * BulkMoveAuthorCommand}.cs.
 *
 * ## Forward-ref note
 *
 * `NzbDrone.Core.Books.Commands` (the real namespace these two classes live
 * in) has not been ported anywhere in this codebase yet -- `books/` (the
 * already-merged Books module this worktree builds on) explicitly defers
 * "Commands/" per its own module doc comment (see `books/index.ts`'s doc
 * comment: "Calibre/, Commands/, Handlers/, Refresh*Service, AddAuthorService,
 * AddBookService, BookCutoffService, MoveAuthorService" are all out of that
 * module's scope). `AuthorController.UpdateAuthor` (moveFiles=true path) and
 * `AuthorEditorController.SaveAll` (bulk move path) both push one of these
 * two commands onto `IManageCommandQueue` -- a real, already-ported queue
 * (`messaging/commands/commandQueueManager.ts`) that only needs a `Command`
 * subclass instance to push, not a registered factory (`registerCommandType`
 * is only needed for the scheduler's by-name `pushByName` path, which
 * neither of these call sites uses -- both push a live instance via the
 * generic `push<TCommand>()` overload). Rather than block this port's
 * `AuthorController`/`AuthorEditorController` on a full `books/commands`
 * module landing (which would also need `MoveAuthorService`/
 * `BulkMoveAuthorService` consumers actually ported to DO anything with a
 * pushed command -- out of scope for an HTTP-controller-only worktree),
 * these two small, faithful `Command` subclasses are declared locally here,
 * matching the field shapes 1:1 off the real C# source. If/when a real
 * `books/commands/` module lands, these should be deleted and the imports
 * in `AuthorController.ts`/`AuthorEditorController.ts` repointed there --
 * nothing about `Command`'s shape or the queue-push call sites would need to
 * change, since this file already extends the same real `Command` base
 * class the eventual module would too.
 */

/** Ported from `MoveAuthorCommand`: `SendUpdatesToClient => true`, `RequiresDiskAccess => true`. */
export class MoveAuthorCommand extends Command {
  authorId = 0;
  sourcePath = "";
  destinationPath = "";

  override get sendUpdatesToClient(): boolean {
    return true;
  }

  override get requiresDiskAccess(): boolean {
    return true;
  }
}

/** Ported from `BulkMoveAuthor` (the per-author payload entry, not itself a Command). C#'s `IEquatable<BulkMoveAuthor>`/`Equals`/`GetHashCode` (identity by `AuthorId` alone) aren't ported -- nothing in this module's call sites compares `BulkMoveAuthor` instances for equality (unlike `CommandEqualityComparer`'s use of a command's OWN equality for dedup, which operates on `BulkMoveAuthorCommand` as a whole via the queue manager's existing generic dedup path, not per-entry). */
export interface BulkMoveAuthor {
  authorId: number;
  sourcePath: string;
}

/** Ported from `BulkMoveAuthorCommand`: `SendUpdatesToClient => true`, `RequiresDiskAccess => true`. */
export class BulkMoveAuthorCommand extends Command {
  author: BulkMoveAuthor[] = [];
  destinationRootFolder = "";

  override get sendUpdatesToClient(): boolean {
    return true;
  }

  override get requiresDiskAccess(): boolean {
    return true;
  }
}
