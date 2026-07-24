import { describe, expect, it } from "vitest";
import { AuthorStatusType, NewItemMonitorTypes, type Author } from "../../../../books/index.js";
import { isValidAuthorFolderAsRootFolder } from "../AuthorFolderAsRootFolderValidator.js";
import { authorToResource, type AuthorResource } from "../AuthorResource.js";

function makeAuthorResource(overrides: Partial<AuthorResource> = {}): AuthorResource {
  const author: Author = {
    id: 0,
    authorMetadataId: 0,
    cleanName: "stephenking",
    monitored: true,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: "",
    rootFolderPath: "",
    added: null,
    qualityProfileId: 1,
    metadataProfileId: 1,
    tags: [],
    metadata: {
      id: 0,
      foreignAuthorId: "fa-1",
      titleSlug: "stephen-king",
      name: "Stephen King",
      sortName: "king stephen",
      nameLastFirst: "King, Stephen",
      sortNameLastFirst: "king stephen",
      aliases: [],
      overview: null,
      disambiguation: null,
      gender: null,
      hometown: null,
      born: null,
      died: null,
      status: AuthorStatusType.Continuing,
      images: [],
      links: [],
      genres: [],
      ratings: { votes: 0, value: 0 },
    },
  };
  return { ...authorToResource(author)!, ...overrides };
}

describe("isValidAuthorFolderAsRootFolder", () => {
  const getAuthorFolder = () => "Stephen King";

  it("is valid when rootFolderPath is null/undefined", () => {
    expect(
      isValidAuthorFolderAsRootFolder(getAuthorFolder, makeAuthorResource(), null).isValid
    ).toBe(true);
    expect(
      isValidAuthorFolderAsRootFolder(getAuthorFolder, makeAuthorResource(), undefined).isValid
    ).toBe(true);
  });

  it("is valid when rootFolderPath is blank", () => {
    expect(
      isValidAuthorFolderAsRootFolder(getAuthorFolder, makeAuthorResource(), "   ").isValid
    ).toBe(true);
  });

  it("is invalid when the root folder's last segment exactly matches the author folder", () => {
    const result = isValidAuthorFolderAsRootFolder(
      getAuthorFolder,
      makeAuthorResource(),
      "/books/Stephen King"
    );

    expect(result.isValid).toBe(false);
    expect(result.authorFolder).toBe("Stephen King");
    expect(result.rootFolderPath).toBe("/books/Stephen King");
  });

  it("is invalid when the root folder's last segment is a close (but not exact) match", () => {
    // "Stephen Kingg" vs "Stephen King": distance 1, threshold = max(1, 12*0.2) = 2.4 -> 1 < 2.4 -> invalid.
    const result = isValidAuthorFolderAsRootFolder(
      getAuthorFolder,
      makeAuthorResource(),
      "/books/Stephen Kingg"
    );

    expect(result.isValid).toBe(false);
  });

  it("is valid when the root folder's last segment is genuinely different", () => {
    const result = isValidAuthorFolderAsRootFolder(getAuthorFolder, makeAuthorResource(), "/books");

    expect(result.isValid).toBe(true);
  });
});
