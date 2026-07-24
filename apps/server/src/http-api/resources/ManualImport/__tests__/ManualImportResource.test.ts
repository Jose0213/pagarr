import { describe, expect, it } from "vitest";
import type { Author, Book } from "../../../../books/index.js";
import { newBook } from "../../../../books/index.js";
import {
  newManualImportItem,
  type ManualImportItem,
} from "../../../../media-files-import/bookImport/manual/manualImportItem.js";
import {
  manualImportItemToResource,
  manualImportItemsToResource,
} from "../ManualImportResource.js";

describe("manualImportItemToResource", () => {
  it("returns null for a null/undefined model", () => {
    expect(manualImportItemToResource(null)).toBeNull();
    expect(manualImportItemToResource(undefined)).toBeNull();
  });

  it("maps a plain item with no author/book, qualityWeight left at 0", () => {
    const item: ManualImportItem = { ...newManualImportItem(), id: 7, path: "/x.mp3", name: "x" };

    const resource = manualImportItemToResource(item);

    expect(resource).toMatchObject({ id: 7, path: "/x.mp3", name: "x", author: null, book: null });
    expect(resource!.qualityWeight).toBe(0);
  });

  // author/book embedding now uses the real AuthorResource/BookResource
  // mappers (resources/author/AuthorResource.ts, resources/books/
  // BookResource.ts -- see those modules' own test suites for full mapper
  // coverage); repointed during merge reconciliation from this module's
  // original narrow ManualImportAuthorResource/ManualImportBookResource
  // forward-ref stand-ins.
  it("embeds the real AuthorResource/BookResource when both are populated", () => {
    const author = {
      id: 5,
      authorMetadataId: 5,
      cleanName: "brandonsanderson",
      metadata: {
        id: 5,
        name: "Brandon Sanderson",
        titleSlug: "brandon-sanderson",
        foreignAuthorId: "fa-5",
      },
    } as unknown as Author;
    const book = { ...newBook(), id: 3, title: "The Way of Kings" };
    const item: ManualImportItem = { ...newManualImportItem(), id: 9, author, book };

    const resource = manualImportItemToResource(item);

    expect(resource!.author).toMatchObject({ id: 5, authorName: "Brandon Sanderson" });
    expect(resource!.book).toMatchObject({ id: 3, title: "The Way of Kings" });
  });

  it("falls back to the monitored edition's foreignEditionId when no edition is set", () => {
    const book = {
      ...newBook(),
      id: 1,
      editions: [
        { id: 1, monitored: false, foreignEditionId: "not-this-one" },
        { id: 2, monitored: true, foreignEditionId: "the-monitored-one" },
      ],
    } as unknown as Book;
    const item: ManualImportItem = { ...newManualImportItem(), book };

    const resource = manualImportItemToResource(item);

    expect(resource!.foreignEditionId).toBe("the-monitored-one");
  });

  it("prefers the item's own edition foreignEditionId over the book's monitored edition", () => {
    const book = {
      ...newBook(),
      id: 1,
      editions: [{ id: 2, monitored: true, foreignEditionId: "book-level" }],
    } as unknown as Book;
    const item: ManualImportItem = {
      ...newManualImportItem(),
      book,
      edition: { foreignEditionId: "item-level" } as never,
    };

    const resource = manualImportItemToResource(item);

    expect(resource!.foreignEditionId).toBe("item-level");
  });
});

describe("manualImportItemsToResource", () => {
  it("maps an iterable of items", () => {
    const items: ManualImportItem[] = [
      { ...newManualImportItem(), id: 1 },
      { ...newManualImportItem(), id: 2 },
    ];

    const resources = manualImportItemsToResource(items);

    expect(resources).toHaveLength(2);
    expect(resources.map((r) => r.id)).toEqual([1, 2]);
  });
});
