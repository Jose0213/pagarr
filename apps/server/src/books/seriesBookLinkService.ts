/**
 * Ported from NzbDrone.Core/Books/Services/SeriesBookLinkService.cs.
 *
 * C# implemented `IHandle<BookDeletedEvent>` -- the Messaging module
 * (Phase 4, not yet ported) auto-discovered and wired up every `IHandle<T>`
 * so `Handle(BookDeletedEvent)` ran automatically whenever that event was
 * published. Without that bus, `handleBookDeleted` is kept as a plain
 * method with the exact same body; callers that publish `BookDeletedEvent`
 * (see bookService.ts's `deleteMany`) are expected to invoke it explicitly
 * until Messaging lands and a real subscription can replace the manual
 * call. This mirrors the same deviation events.ts documents for
 * IBooksEventAggregator generally.
 */

import type { BookDeletedEvent } from "./events.js";
import type { SeriesBookLinkRepository } from "./seriesBookLinkRepository.js";
import type { SeriesBookLink } from "./models.js";

export class SeriesBookLinkService {
  constructor(private readonly repo: SeriesBookLinkRepository) {}

  getLinksBySeries(seriesId: number): SeriesBookLink[] {
    return this.repo.getLinksBySeries(seriesId);
  }

  getLinksBySeriesAndAuthor(seriesId: number, foreignAuthorId: string): SeriesBookLink[] {
    return this.repo.getLinksBySeriesAndAuthor(seriesId, foreignAuthorId);
  }

  getLinksByBook(bookIds: number[]): SeriesBookLink[] {
    return this.repo.getLinksByBook(bookIds);
  }

  insertMany(model: SeriesBookLink[]): void {
    this.repo.insertMany(model);
  }

  updateMany(model: SeriesBookLink[]): void {
    this.repo.updateMany(model);
  }

  deleteMany(model: SeriesBookLink[]): void {
    this.repo.deleteMany(model);
  }

  /** Ported from SeriesBookLinkService.Handle(BookDeletedEvent message). */
  handleBookDeleted(message: BookDeletedEvent): void {
    const links = this.getLinksByBook([message.book.id]);
    this.deleteMany(links);
  }
}
