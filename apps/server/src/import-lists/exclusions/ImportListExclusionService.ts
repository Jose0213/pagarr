import type { AuthorDeletedEvent, BookDeletedEvent } from "../../books/events.js";
import type { IImportListExclusionRepository } from "./ImportListExclusionRepository.js";
import { createImportListExclusion, type ImportListExclusion } from "./ImportListExclusion.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Exclusions/ImportListExclusionService.cs.
 *
 * `IHandleAsync<AuthorDeletedEvent>`/`IHandleAsync<BookDeletedEvent>` are
 * ported as plain `handleAuthorDeleted`/`handleBookDeleted` methods rather
 * than auto-wired event-bus subscriptions -- matching this port's
 * established pattern (see `books/bookService.ts`'s module doc comment:
 * "ported as a plain `handleAuthorDeleted` method... the same
 * caller-invokes-explicitly note applies"). A future wiring of the real
 * `IEventAggregator` (once Books' own event publication is connected to
 * ImportLists) would `subscribeAsync(AuthorDeletedEvent, (e) =>
 * service.handleAuthorDeleted(e))`.
 */
export interface IImportListExclusionService {
  add(importListExclusion: ImportListExclusion): ImportListExclusion;
  all(): ImportListExclusion[];
  delete(id: number): void;
  deleteByForeignId(foreignId: string): void;
  get(id: number): ImportListExclusion;
  findByForeignId(foreignId: string): ImportListExclusion | undefined;
  findByForeignIds(foreignIds: string[]): ImportListExclusion[];
  update(importListExclusion: ImportListExclusion): ImportListExclusion;
  handleAuthorDeleted(message: AuthorDeletedEvent): void;
  handleBookDeleted(message: BookDeletedEvent): void;
}

export class ImportListExclusionService implements IImportListExclusionService {
  constructor(private readonly repo: IImportListExclusionRepository) {}

  add(importListExclusion: ImportListExclusion): ImportListExclusion {
    return this.repo.insert(importListExclusion);
  }

  update(importListExclusion: ImportListExclusion): ImportListExclusion {
    return this.repo.update(importListExclusion);
  }

  delete(id: number): void {
    this.repo.delete(id);
  }

  /** Ported from ImportListExclusionService.Delete(string foreignId). */
  deleteByForeignId(foreignId: string): void {
    const exclusion = this.findByForeignId(foreignId);
    if (exclusion) {
      this.delete(exclusion.id);
    }
  }

  get(id: number): ImportListExclusion {
    return this.repo.get(id);
  }

  findByForeignId(foreignId: string): ImportListExclusion | undefined {
    return this.repo.findByForeignId(foreignId);
  }

  findByForeignIds(foreignIds: string[]): ImportListExclusion[] {
    return this.repo.findByForeignIds(foreignIds);
  }

  all(): ImportListExclusion[] {
    return this.repo.all();
  }

  /** Ported from ImportListExclusionService.HandleAsync(AuthorDeletedEvent). */
  handleAuthorDeleted(message: AuthorDeletedEvent): void {
    if (!message.addImportListExclusion) {
      return;
    }

    const foreignAuthorId = message.author.metadata?.foreignAuthorId;
    if (foreignAuthorId === undefined) {
      return;
    }

    const existingExclusion = this.repo.findByForeignId(foreignAuthorId);
    if (existingExclusion !== undefined) {
      return;
    }

    this.repo.insert(
      createImportListExclusion({
        foreignId: foreignAuthorId,
        name: message.author.metadata?.name ?? "",
      })
    );
  }

  /** Ported from ImportListExclusionService.HandleAsync(BookDeletedEvent). */
  handleBookDeleted(message: BookDeletedEvent): void {
    if (!message.addImportListExclusion) {
      return;
    }

    const existingExclusion = this.repo.findByForeignId(message.book.foreignBookId);
    if (existingExclusion !== undefined) {
      return;
    }

    const authorName = message.book.authorMetadata?.name ?? "";

    this.repo.insert(
      createImportListExclusion({
        foreignId: message.book.foreignBookId,
        name: `${authorName} - ${message.book.title}`,
      })
    );
  }
}
