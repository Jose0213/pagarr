import type { Author, Book, Edition } from "../../books/models.js";
import type { QualityModel } from "../../qualities/qualityModel.js";
import type { BookFile } from "../../media-files-import/bookFile.js";
import type { RenamedBookFile } from "../../media-files-organize/renamedBookFile.js";
import type { RemoteBook } from "../../parser/model/remoteBook.js";

/**
 * Ported from NzbDrone.Core/Notifications/Webhook/WebhookAuthor.cs,
 * WebhookBook.cs, WebhookBookEdition.cs, WebhookBookFile.cs,
 * WebhookRelease.cs, WebhookRenamedBookFile.cs.
 *
 * Every C# class here has a parameterless ctor (for JSON deserialization)
 * plus a from-domain-model ctor -- ported as a plain data interface + a
 * `fromX(...)` factory function per class, matching this port's established
 * class-ctor -> factory-function convention (see `notifications/forwardRefs.ts`'s
 * `createAuthorDeleteMessage` doc comment).
 */
export interface WebhookAuthor {
  id: number;
  name: string | null;
  path: string | null;
  goodreadsId: string | null;
}

/** Ported from `WebhookAuthor(Author author)`: `Name = author.Name` reads the real C#'s `Author.Name` passthrough property (`Metadata.Value.Name`) -- see this module's doc comment for confirmation both resolve identically. */
export function webhookAuthorFromAuthor(author: Author): WebhookAuthor {
  return {
    id: author.id,
    name: author.metadata?.name ?? null,
    path: author.path,
    goodreadsId: author.metadata?.foreignAuthorId ?? null,
  };
}

export function newWebhookAuthor(overrides: Partial<WebhookAuthor> = {}): WebhookAuthor {
  return { id: 0, name: null, path: null, goodreadsId: null, ...overrides };
}

export interface WebhookBookEdition {
  title: string | null;
  goodreadsId: string | null;
  asin: string | null;
  isbn13: string | null;
}

export function webhookBookEditionFromEdition(edition: Edition): WebhookBookEdition {
  return {
    goodreadsId: edition.foreignEditionId,
    title: edition.title,
    asin: edition.asin,
    isbn13: edition.isbn13,
  };
}

export interface WebhookBook {
  id: number;
  goodreadsId: string | null;
  title: string | null;
  edition: WebhookBookEdition | null;
  releaseDate: string | null;
}

/**
 * Ported from `WebhookBook(Book book)`:
 * `Edition = new WebhookBookEdition(book.Editions.Value.Single(e => e.Monitored))`
 * -- throws (`InvalidOperationException`, via LINQ `.Single()`) if zero or
 * more than one monitored edition exists. Ported as a genuine throw here
 * too (not silently defaulted), matching the C#'s "this is a programming
 * invariant violation, not a recoverable case" behavior -- every book is
 * expected to have exactly one monitored edition by the time a webhook
 * payload is built.
 */
export function webhookBookFromBook(book: Book): WebhookBook {
  const editions = book.editions ?? [];
  const monitored = editions.filter((e) => e.monitored);

  if (monitored.length !== 1) {
    throw new Error(
      `Sequence contains ${monitored.length === 0 ? "no" : "more than one"} matching element`
    );
  }

  return {
    id: book.id,
    goodreadsId: book.foreignBookId,
    title: book.title,
    releaseDate: book.releaseDate,
    edition: webhookBookEditionFromEdition(monitored[0]!),
  };
}

export function newWebhookBook(overrides: Partial<WebhookBook> = {}): WebhookBook {
  return { id: 0, goodreadsId: null, title: null, edition: null, releaseDate: null, ...overrides };
}

export interface WebhookBookFile {
  id: number;
  path: string | null;
  quality: string | null;
  qualityVersion: number;
  releaseGroup: string | null;
  sceneName: string | null;
  size: number;
  dateAdded: string | null;
}

export function webhookBookFileFromBookFile(bookFile: BookFile): WebhookBookFile {
  return {
    id: bookFile.id,
    path: bookFile.path,
    quality: bookFile.quality.quality.name,
    qualityVersion: bookFile.quality.revision.version,
    releaseGroup: bookFile.releaseGroup,
    sceneName: bookFile.sceneName,
    size: bookFile.size,
    dateAdded: bookFile.dateAdded,
  };
}

/** Ported from WebhookRenamedBookFile.cs (`: WebhookBookFile`) -- TS has no class inheritance concern here since these are plain data shapes; modeled as WebhookBookFile's fields plus `previousPath`. */
export interface WebhookRenamedBookFile extends WebhookBookFile {
  previousPath: string;
}

/**
 * PRE-EXISTING CROSS-MODULE TYPE GAP (not introduced by this reconciliation):
 * `media-files-organize/renamedBookFile.ts`'s `RenamedBookFile.bookFile`
 * uses `media-files-organize/types.ts`'s own narrow `BookFile` forward-ref
 * (that module's own stand-in for the not-yet-reconciled real
 * `media-files-import/bookFile.ts` `BookFile` -- see that file's module doc
 * comment), whose `quality` field is narrowed to `{ quality: { id: number } }`
 * (just enough for organize's own naming-template engine), not the full
 * `QualityModel` shape (`{ quality: { name }, revision: { version } }`) this
 * function needs to build `WebhookBookFile.quality`/`qualityVersion`. Both
 * `BookFile` definitions describe the same real C# entity and agree on every
 * field this function actually reads except `quality`'s shape -- narrowed via
 * a structural cast rather than widening either already-merged module's
 * public type (out of this reconciliation's scope; a future dedicated pass
 * reconciling `media-files-organize` against `media-files-import`'s real
 * `BookFile` is the correct place to remove this cast).
 */
export function webhookRenamedBookFileFromRenamedBookFile(
  renamedFile: RenamedBookFile
): WebhookRenamedBookFile {
  return {
    ...webhookBookFileFromBookFile(renamedFile.bookFile as unknown as BookFile),
    previousPath: renamedFile.previousPath,
  };
}

export interface WebhookRelease {
  quality: string | null;
  qualityVersion: number;
  releaseGroup: string | null;
  releaseTitle: string | null;
  indexer: string | null;
  size: number;
  customFormatScore: number;
  customFormats: string[] | null;
}

/**
 * Real `RemoteBook.customFormats` is `unknown[]` (CustomFormats isn't
 * ported yet -- see `parser/model/remoteBook.ts`'s doc comment), narrower
 * than the shape this function actually needs (`{ name: string }[]`, to
 * build `WebhookRelease.customFormats: string[] | null`). Narrowed here to
 * only the field this function reads, matching this port's established
 * narrow-forward-ref convention elsewhere in this module.
 */
export function webhookReleaseFromRemoteBook(
  quality: QualityModel,
  remoteBook: RemoteBook
): WebhookRelease {
  const customFormats = remoteBook.customFormats as { name: string }[] | null;

  return {
    quality: quality.quality.name,
    qualityVersion: quality.revision.version,
    releaseGroup: remoteBook.parsedBookInfo?.releaseGroup ?? null,
    releaseTitle: remoteBook.release?.title ?? null,
    indexer: remoteBook.release?.indexer ?? null,
    size: remoteBook.release?.size ?? 0,
    customFormats: customFormats?.map((x) => x.name) ?? null,
    customFormatScore: remoteBook.customFormatScore,
  };
}
