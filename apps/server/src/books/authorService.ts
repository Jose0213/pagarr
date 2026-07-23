/**
 * Ported from NzbDrone.Core/Books/Services/AuthorService.cs.
 *
 * ## Deviations
 *
 * - No `ICached<List<Author>>` 30s rolling cache (`ICacheManager`,
 *   `NzbDrone.Common.Cache`, not part of this or any already-ported
 *   module). `getAllAuthors()` queries the repository directly every call.
 *   Behaviorally this only affects performance, not correctness -- every
 *   mutating method still has a comment marking where the C# called
 *   `_cache.Clear()`, so if a real cache layer is added later, invalidation
 *   points are already marked.
 * - `IBuildAuthorPaths` (AuthorPathBuilder) is Organizer/RootFolders logic
 *   not yet ported (see PORT_PLAN.md Phase 3's Organizer, Phase 1's
 *   RootFolders) -- `updateAuthors()` takes a `buildPath` callback
 *   parameter instead of a constructor-injected path builder, matching
 *   this module's general "inject the missing piece narrowly" approach
 *   (see textMatching.ts's module doc comment for the same pattern).
 * - `ITextMatcher` (textMatching.ts) stands in for `NzbDrone.Core.Parser`'s
 *   `CleanAuthorName`/`FuzzyMatch` extension methods -- see that file's
 *   module doc comment.
 * - No NLog `Logger` (see monitorNewBookService.ts's doc comment for why).
 */

import type { AuthorRepository } from "./authorRepository.js";
import {
  AuthorAddedEvent,
  AuthorDeletedEvent,
  AuthorEditedEvent,
  AuthorsImportedEvent,
  type IBooksEventAggregator,
} from "./events.js";
import { findByStringInexact, type ITextMatcher } from "./textMatching.js";
import type { Author } from "./models.js";

export class AuthorService {
  constructor(
    private readonly authorRepository: AuthorRepository,
    private readonly eventAggregator: IBooksEventAggregator,
    private readonly textMatcher: ITextMatcher
  ) {}

  /** Ported from AuthorService.AddAuthor(Author newAuthor, bool doRefresh). */
  addAuthor(newAuthor: Author, doRefresh: boolean): Author {
    // _cache.Clear() -- no-op, see module doc comment.
    const inserted = this.authorRepository.insert(newAuthor);
    this.eventAggregator.publishEvent(new AuthorAddedEvent(this.getAuthor(inserted.id), doRefresh));
    return inserted;
  }

  /** Ported from AuthorService.AddAuthors(List<Author> newAuthors, bool doRefresh). */
  addAuthors(newAuthors: Author[], doRefresh: boolean): Author[] {
    // _cache.Clear() -- no-op, see module doc comment.
    const inserted = this.authorRepository.insertMany(newAuthors);
    this.eventAggregator.publishEvent(
      new AuthorsImportedEvent(
        inserted.map((a) => a.id),
        doRefresh
      )
    );
    return inserted;
  }

  authorPathExists(folder: string): boolean {
    return this.authorRepository.authorPathExists(folder);
  }

  /** Ported from AuthorService.DeleteAuthor(int authorId, bool deleteFiles, bool addImportListExclusion = false). */
  deleteAuthor(authorId: number, deleteFiles: boolean, addImportListExclusion = false): void {
    // _cache.Clear() -- no-op, see module doc comment.
    const author = this.authorRepository.get(authorId);
    this.authorRepository.delete(authorId);
    this.eventAggregator.publishEvent(new AuthorDeletedEvent(author, deleteFiles, addImportListExclusion));
  }

  findById(foreignAuthorId: string): Author | undefined {
    return this.authorRepository.findById(foreignAuthorId);
  }

  /** Ported from AuthorService.FindByName(string title): cleans the title first via ITextMatcher.cleanAuthorName. */
  findByName(title: string): Author | undefined {
    return this.authorRepository.findByName(this.textMatcher.cleanAuthorName(title));
  }

  /** Ported from AuthorService.AuthorScoringFunctions(string title, string cleanTitle): both functions score against the same (uncleaned) title. */
  private authorScoringFunctions(title: string): Array<(author: Author) => number> {
    return [
      (a) => this.textMatcher.fuzzyMatch(a.metadata?.name ?? "", title),
      (a) => this.textMatcher.fuzzyMatch(a.metadata?.nameLastFirst ?? "", title),
    ];
  }

  /** Ported from AuthorService.FindByNameInexact(string title). */
  findByNameInexact(title: string): Author | undefined {
    const authors = this.getAllAuthors();

    for (const scoreFn of this.authorScoringFunctions(title)) {
      const results = findByStringInexact(authors, scoreFn, 0.8, 0.2);
      if (results.length === 1) {
        return results[0];
      }
    }

    return undefined;
  }

  /** Ported from AuthorService.GetCandidates(string title). */
  getCandidates(title: string): Author[] {
    const authors = this.getAllAuthors();
    const output: Author[] = [];

    for (const scoreFn of this.authorScoringFunctions(title)) {
      output.push(...findByStringInexact(authors, scoreFn, 0.8, 0.2));
    }

    return distinctById(output);
  }

  /**
   * Ported from AuthorService.ReportAuthorScoringFunctions(string
   * reportTitle, string cleanReportTitle): note the *reversed* argument
   * order (report title first, candidate name second) with an explicit
   * lower match threshold (0.6) baked into the C# call
   * (`t.FuzzyMatch(a.Metadata.Value.Name, 0.6)`) -- FuzzyMatch's threshold
   * only affects its internal algorithm, not the score comparison here, so
   * it's passed straight through to the injected matcher.
   */
  private reportAuthorScoringFunctions(reportTitle: string): Array<(author: Author) => number> {
    return [
      (a) => this.textMatcher.fuzzyMatch(reportTitle, a.metadata?.name ?? ""),
      (a) => this.textMatcher.fuzzyMatch(reportTitle, a.metadata?.nameLastFirst ?? ""),
    ];
  }

  /** Ported from AuthorService.GetReportCandidates(string reportTitle). */
  getReportCandidates(reportTitle: string): Author[] {
    const authors = this.getAllAuthors();
    const output: Author[] = [];

    for (const scoreFn of this.reportAuthorScoringFunctions(reportTitle)) {
      output.push(...findByStringInexact(authors, scoreFn, 0.8, 0.2));
    }

    return distinctById(output);
  }

  getAllAuthors(): Author[] {
    // _cache.Get(...) -- no-op cache, see module doc comment; queries directly.
    return this.authorRepository.allWithMetadata();
  }

  getAllAuthorTags(): Map<number, number[]> {
    return this.authorRepository.allAuthorTags();
  }

  allAuthorPaths(): Map<number, string> {
    return this.authorRepository.allAuthorPaths();
  }

  /** Ported from AuthorService.AllForTag(int tagId): `GetAllAuthors().Where(s => s.Tags.Contains(tagId))`. */
  allForTag(tagId: number): Author[] {
    return this.getAllAuthors().filter((a) => a.tags.includes(tagId));
  }

  getAuthor(authorId: number): Author {
    return this.authorRepository.get(authorId);
  }

  getAuthorByMetadataId(authorMetadataId: number): Author | undefined {
    return this.authorRepository.getAuthorByMetadataId(authorMetadataId);
  }

  getAuthors(authorIds: number[]): Author[] {
    return this.authorRepository.getMany(authorIds);
  }

  /** Ported from AuthorService.RemoveAddOptions(Author author): `SetFields(author, s => s.AddOptions)`. */
  removeAddOptions(author: Author): void {
    this.authorRepository.setFields(author, ["addOptions"]);
  }

  /**
   * Ported from AuthorService.UpdateAuthor(Author author): never persists
   * a caller-supplied AddOptions -- always keeps the stored author's
   * existing value.
   */
  updateAuthor(author: Author): Author {
    // _cache.Clear() -- no-op, see module doc comment.
    const storedAuthor = this.getAuthor(author.id);
    const toUpdate: Author = { ...author, addOptions: storedAuthor.addOptions };

    const updatedAuthor = this.authorRepository.update(toUpdate);
    this.eventAggregator.publishEvent(new AuthorEditedEvent(updatedAuthor, storedAuthor));

    return updatedAuthor;
  }

  /**
   * Ported from AuthorService.UpdateAuthors(List<Author> author, bool
   * useExistingRelativeFolder): for each author with a non-blank
   * RootFolderPath, recompute Path via the injected `buildPath` callback
   * (stand-in for IBuildAuthorPaths -- see this module's doc comment).
   */
  updateAuthors(
    authors: Author[],
    useExistingRelativeFolder: boolean,
    buildPath: (author: Author, useExistingRelativeFolder: boolean) => string
  ): Author[] {
    // _cache.Clear() -- no-op, see module doc comment.
    const updated = authors.map((author) => {
      if (author.rootFolderPath.trim() !== "") {
        return { ...author, path: buildPath(author, useExistingRelativeFolder) };
      }
      return author;
    });

    this.authorRepository.updateMany(updated);

    return updated;
  }
}

function distinctById(authors: Author[]): Author[] {
  const seen = new Set<number>();
  const result: Author[] = [];
  for (const a of authors) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      result.push(a);
    }
  }
  return result;
}
