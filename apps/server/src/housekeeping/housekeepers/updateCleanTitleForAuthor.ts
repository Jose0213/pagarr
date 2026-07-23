import { cleanAuthorName } from "../../parser/parser.js";
import type { AuthorRepository } from "../../books/authorRepository.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/UpdateCleanTitleForAuthor.cs.
 *
 * Recomputes every Author's "CleanName" from its "Name" via
 * `Parser.CleanAuthorName` (ported as the real `cleanAuthorName` free
 * function -- see parser/parser.ts, the same function
 * `books/authorService.ts`'s `findByName` already uses), writing back only
 * rows whose stored CleanName is now stale/out of date.
 *
 * C#'s `Author.Name` is a compatibility property proxying
 * `Metadata.Value.Name` -- the real C# `_authorRepository.All()` always
 * came back with `.Metadata` populated (AuthorRepository overrode
 * Query()/Builder() to always join AuthorMetadata; see
 * `books/authorRepository.ts`'s module doc comment). This port's plain
 * `all()` deliberately does NOT auto-join (same doc comment), so this task
 * uses `allWithMetadata()` instead -- the method that file added
 * specifically so callers needing what `_authorRepository.All()` actually
 * returned in the original have an explicit way to get it.
 */
export class UpdateCleanTitleForAuthor implements IHousekeepingTask {
  constructor(
    private readonly authorRepository: Pick<AuthorRepository, "allWithMetadata" | "update">
  ) {}

  clean(): void {
    const authors = this.authorRepository.allWithMetadata();

    for (const author of authors) {
      const name = author.metadata?.name ?? "";
      const cleanName = cleanAuthorName(name);
      if (author.cleanName !== cleanName) {
        author.cleanName = cleanName;
        this.authorRepository.update(author);
      }
    }
  }
}
