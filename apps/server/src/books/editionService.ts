/**
 * Ported from NzbDrone.Core/Books/Services/EditionService.cs.
 *
 * ## Deviations
 *
 * - `ITextMatcher` (textMatching.ts) stands in for the Parser-module
 *   extension methods `EditionScoringFunctions` uses -- see that file's
 *   module doc comment.
 * - `IHandle<BookDeletedEvent>` is ported as a plain `handleBookDeleted`
 *   method -- see seriesBookLinkService.ts's module doc comment for why.
 * - `insertMany` returns `Edition[]` instead of C#'s `void`. C#'s
 *   `BasicRepository<T>.InsertMany` (via Dapper) mutated each input
 *   `Edition`'s `Id` property in place, so callers like
 *   `BookService.AddBook` could keep using their original list references
 *   after calling `InsertMany` and see the generated ids. This port's
 *   `BasicRepository.insertMany` (db/basic-repository.ts) deliberately
 *   returns a *new* array of inserted models instead of mutating the
 *   input in place (a TS-appropriate immutability choice already made at
 *   the Datastore layer, not something this module can or should route
 *   around) -- so callers need the return value to know the generated
 *   ids. See bookService.ts's `addBook` for the reconciliation this
 *   requires.
 */

import type { EditionRepository } from "./editionRepository.js";
import { EditionDeletedEvent, type BookDeletedEvent, type IBooksEventAggregator } from "./events.js";
import { findByStringInexact, type ITextMatcher } from "./textMatching.js";
import type { Edition } from "./models.js";

export class EditionService {
  constructor(
    private readonly editionRepository: EditionRepository,
    private readonly eventAggregator: IBooksEventAggregator,
    private readonly textMatcher: ITextMatcher
  ) {}

  getEdition(id: number): Edition {
    return this.editionRepository.get(id);
  }

  getEditionByForeignEditionId(foreignEditionId: string): Edition | undefined {
    return this.editionRepository.findByForeignEditionId(foreignEditionId);
  }

  getAllMonitoredEditions(): Edition[] {
    return this.editionRepository.getAllMonitoredEditions();
  }

  insertMany(editions: Edition[]): Edition[] {
    return this.editionRepository.insertMany(editions);
  }

  updateMany(editions: Edition[]): void {
    this.editionRepository.updateMany(editions);
  }

  /** Ported from EditionService.DeleteMany(List<Edition> editions): deletes then publishes one EditionDeletedEvent per edition. */
  deleteMany(editions: Edition[]): void {
    this.editionRepository.deleteMany(editions);

    for (const edition of editions) {
      this.eventAggregator.publishEvent(new EditionDeletedEvent(edition));
    }
  }

  getEditionsForRefresh(bookId: number, foreignEditionIds: string[]): Edition[] {
    return this.editionRepository.getEditionsForRefresh(bookId, foreignEditionIds);
  }

  getEditionsByBook(bookIdOrIds: number | number[]): Edition[] {
    return this.editionRepository.findByBook(Array.isArray(bookIdOrIds) ? bookIdOrIds : [bookIdOrIds]);
  }

  getEditionsByAuthor(authorId: number): Edition[] {
    return this.editionRepository.findByAuthor(authorId);
  }

  findByTitle(authorMetadataId: number, title: string): Edition | undefined {
    return this.editionRepository.findByTitle(authorMetadataId, title);
  }

  /** Ported from EditionService.EditionScoringFunctions(string title). */
  private editionScoringFunctions(title: string): Array<(edition: Edition) => number> {
    const cleanBrackets = this.textMatcher.cleanAuthorName(this.textMatcher.removeBracketsAndContents(title));
    const cleanDash = this.textMatcher.cleanAuthorName(this.textMatcher.removeAfterDash(title));
    const cleanBracketDash = this.textMatcher.cleanAuthorName(
      this.textMatcher.removeAfterDash(this.textMatcher.removeBracketsAndContents(title))
    );

    return [
      (e) => this.textMatcher.fuzzyMatch(e.title, title),
      (e) => this.textMatcher.fuzzyMatch(e.title, cleanBrackets),
      (e) => this.textMatcher.fuzzyMatch(e.title, cleanDash),
      (e) => this.textMatcher.fuzzyMatch(e.title, cleanBracketDash),
      (e) => this.textMatcher.fuzzyContains(title, e.title),
    ];
  }

  /** Ported from EditionService.FindByTitleInexact(int authorMetadataId, string title). */
  findByTitleInexact(authorMetadataId: number, title: string): Edition | undefined {
    const editions = this.editionRepository.findByAuthorMetadataId(authorMetadataId, true);

    for (const scoreFn of this.editionScoringFunctions(title)) {
      const results = findByStringInexact(editions, scoreFn, 0.7, 0.4);
      if (results.length === 1) {
        return results[0];
      }
    }

    return undefined;
  }

  /** Ported from EditionService.GetCandidates(int authorMetadataId, string title). */
  getCandidates(authorMetadataId: number, title: string): Edition[] {
    const editions = this.editionRepository.findByAuthorMetadataId(authorMetadataId, true);
    const output: Edition[] = [];

    for (const scoreFn of this.editionScoringFunctions(title)) {
      output.push(...findByStringInexact(editions, scoreFn, 0.7, 0.4));
    }

    return distinctById(output);
  }

  setMonitored(edition: Edition): Edition[] {
    return this.editionRepository.setMonitored(edition);
  }

  /** Ported from EditionService.Handle(BookDeletedEvent message). */
  handleBookDeleted(message: BookDeletedEvent): void {
    const editions = this.getEditionsByBook(message.book.id);
    this.deleteMany(editions);
  }
}

function distinctById(editions: Edition[]): Edition[] {
  const seen = new Set<number>();
  const result: Edition[] = [];
  for (const e of editions) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      result.push(e);
    }
  }
  return result;
}
