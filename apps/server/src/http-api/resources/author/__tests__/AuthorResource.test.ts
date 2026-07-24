import { describe, expect, it } from "vitest";
import { AuthorStatusType, NewItemMonitorTypes, type Author } from "../../../../books/index.js";
import {
  authorEnded,
  authorResourceToModel,
  authorResourceToModelMerge,
  authorResourceToWire,
  authorToResource,
  type AuthorResource,
} from "../AuthorResource.js";

function makeAuthor(overrides: Partial<Author> = {}): Author {
  return {
    id: 1,
    authorMetadataId: 10,
    cleanName: "stephenking",
    monitored: true,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: "/books/Stephen King",
    rootFolderPath: "/books",
    added: "2024-01-01T00:00:00Z",
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [1, 2],
    addOptions: undefined,
    metadata: {
      id: 10,
      foreignAuthorId: "fa-1",
      titleSlug: "stephen-king",
      name: "Stephen King",
      sortName: "king stephen",
      nameLastFirst: "King, Stephen",
      sortNameLastFirst: "king stephen",
      aliases: [],
      overview: "An author",
      disambiguation: null,
      gender: null,
      hometown: null,
      born: null,
      died: null,
      status: AuthorStatusType.Continuing,
      images: [{ coverType: "Poster", url: "/cover.jpg" }],
      links: [],
      genres: ["Horror"],
      ratings: { votes: 10, value: 4.5 },
    },
    ...overrides,
  };
}

describe("authorToResource", () => {
  it("returns null for a null/undefined model", () => {
    expect(authorToResource(null)).toBeNull();
    expect(authorToResource(undefined)).toBeNull();
  });

  it("maps every field from the model + metadata", () => {
    const author = makeAuthor();
    const resource = authorToResource(author);

    expect(resource).not.toBeNull();
    expect(resource?.id).toBe(1);
    expect(resource?.authorMetadataId).toBe(10);
    expect(resource?.authorName).toBe("Stephen King");
    expect(resource?.authorNameLastFirst).toBe("King, Stephen");
    expect(resource?.sortName).toBe("king stephen");
    expect(resource?.status).toBe(AuthorStatusType.Continuing);
    expect(resource?.foreignAuthorId).toBe("fa-1");
    expect(resource?.titleSlug).toBe("stephen-king");
    expect(resource?.path).toBe("/books/Stephen King");
    expect(resource?.qualityProfileId).toBe(1);
    expect(resource?.metadataProfileId).toBe(1);
    expect(resource?.monitored).toBe(true);
    expect(resource?.genres).toEqual(["Horror"]);
    expect(resource?.tags).toEqual([1, 2]);
    expect(resource?.ratings).toEqual({ votes: 10, value: 4.5 });
    // Ported: "Root folder path is now calculated from the author path" -- always "" from the mapper itself.
    expect(resource?.rootFolderPath).toBe("");
    expect(resource?.statistics).toEqual({
      bookFileCount: 0,
      bookCount: 0,
      availableBookCount: 0,
      totalBookCount: 0,
      sizeOnDisk: 0,
      percentOfBooks: 0,
    });
    expect(resource?.nextBook).toBeNull();
    expect(resource?.lastBook).toBeNull();
  });

  it("deep-clones images so mutating the resource doesn't alias the model (JsonClone)", () => {
    const author = makeAuthor();
    const resource = authorToResource(author);

    resource!.images[0]!.url = "/mutated.jpg";

    expect(author.metadata!.images[0]!.url).toBe("/cover.jpg");
  });

  it("throws if the model has no populated .metadata", () => {
    const author = makeAuthor();
    delete author.metadata;

    expect(() => authorToResource(author)).toThrow(/no populated \.metadata/);
  });
});

describe("authorResourceToModel", () => {
  it("returns null for a null/undefined resource", () => {
    expect(authorResourceToModel(null)).toBeNull();
    expect(authorResourceToModel(undefined)).toBeNull();
  });

  it("round-trips the fields ToModel actually sets", () => {
    const author = makeAuthor();
    const resource = authorToResource(author)!;
    resource.rootFolderPath = "/books";

    const model = authorResourceToModel(resource)!;

    expect(model.path).toBe(author.path);
    expect(model.qualityProfileId).toBe(author.qualityProfileId);
    expect(model.metadataProfileId).toBe(author.metadataProfileId);
    expect(model.monitored).toBe(author.monitored);
    expect(model.cleanName).toBe(author.cleanName);
    expect(model.rootFolderPath).toBe("/books");
    expect(model.tags).toEqual(author.tags);
    expect(model.metadata?.name).toBe("Stephen King");
    expect(model.metadata?.foreignAuthorId).toBe("fa-1");
    // ToModel never sets authorMetadataId/lastInfoSync explicitly -- left at defaults.
    expect(model.authorMetadataId).toBe(0);
    expect(model.lastInfoSync).toBeNull();
  });
});

describe("authorResourceToModelMerge", () => {
  it("applies changes onto the existing author (ApplyChanges semantics)", () => {
    const existing = makeAuthor({ id: 5, path: "/old/path", monitored: false });
    const resource: AuthorResource = {
      ...authorToResource(makeAuthor({ id: 5 }))!,
      id: 5,
      path: "/new/path",
      monitored: true,
    };

    const merged = authorResourceToModelMerge(resource, existing);

    expect(merged.path).toBe("/new/path");
    expect(merged.monitored).toBe(true);
    // Fields ApplyChanges does NOT touch stay from `existing`.
    expect(merged.cleanName).toBe(existing.cleanName);
  });
});

describe("authorEnded", () => {
  it("is true only when status is Ended", () => {
    expect(authorEnded({ status: AuthorStatusType.Ended })).toBe(true);
    expect(authorEnded({ status: AuthorStatusType.Continuing })).toBe(false);
  });
});

describe("authorResourceToWire", () => {
  it("drops authorMetadataId and adds the computed ended field", () => {
    const resource = authorToResource(makeAuthor({ metadata: makeAuthor().metadata }))!;
    const wire = authorResourceToWire(resource) as Record<string, unknown>;

    expect(wire["authorMetadataId"]).toBeUndefined();
    expect(wire["ended"]).toBe(false);
  });

  it("computes ended: true for an Ended author", () => {
    const author = makeAuthor();
    author.metadata!.status = AuthorStatusType.Ended;
    const resource = authorToResource(author)!;
    const wire = authorResourceToWire(resource);

    expect(wire.ended).toBe(true);
  });
});
