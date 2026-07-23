import { describe, expect, it } from "vitest";
import {
  isNotExistingRootFolderPath,
  isNotAncestorOfExistingRootFolder,
} from "../../paths/rootFolderValidators.js";
import type { IRootFolderService } from "../../../root-folders/root-folder-service.js";
import type { RootFolder } from "../../../root-folders/root-folder.js";

/**
 * Translated behavior tests for RootFolderValidator/RootFolderAncestorValidator.
 * No direct C# fixture exists for either (exercised indirectly through
 * RootFolderServiceFixture and API validators in the real test suite).
 */

function fakeRootFolder(path: string, id: number): RootFolder {
  return {
    id,
    name: null,
    path,
    defaultMetadataProfileId: 1,
    defaultQualityProfileId: 1,
    defaultMonitorOption: 0,
    defaultNewItemMonitorOption: 0,
    defaultTags: new Set<number>(),
    isCalibreLibrary: false,
    calibreSettings: null,
    accessible: false,
    freeSpace: null,
    totalSpace: null,
  };
}

function fakeRootFolderService(paths: string[]): Pick<IRootFolderService, "all"> {
  return {
    all: () => paths.map((path, i) => fakeRootFolder(path, i + 1)),
  };
}

describe("isNotExistingRootFolderPath", () => {
  it("is valid when the path is null/undefined", () => {
    const service = fakeRootFolderService(["/books"]);
    expect(isNotExistingRootFolderPath(service as IRootFolderService, null)).toBe(true);
    expect(isNotExistingRootFolderPath(service as IRootFolderService, undefined)).toBe(true);
  });

  it("is invalid when an existing root folder has the exact same path", () => {
    const service = fakeRootFolderService(["/books"]);
    expect(isNotExistingRootFolderPath(service as IRootFolderService, "/books")).toBe(false);
  });

  it("is valid when no existing root folder matches", () => {
    const service = fakeRootFolderService(["/books"]);
    expect(isNotExistingRootFolderPath(service as IRootFolderService, "/audiobooks")).toBe(true);
  });
});

describe("isNotAncestorOfExistingRootFolder", () => {
  it("is valid when the path is null/undefined", () => {
    const service = fakeRootFolderService(["/books/fiction"]);
    expect(isNotAncestorOfExistingRootFolder(service as IRootFolderService, null)).toBe(true);
  });

  it("is invalid when the candidate path is an ancestor of an existing root folder", () => {
    const service = fakeRootFolderService(["/books/fiction"]);
    expect(isNotAncestorOfExistingRootFolder(service as IRootFolderService, "/books")).toBe(false);
  });

  it("is valid when the candidate path is a descendant, not an ancestor", () => {
    const service = fakeRootFolderService(["/books"]);
    expect(isNotAncestorOfExistingRootFolder(service as IRootFolderService, "/books/fiction")).toBe(
      true
    );
  });

  it("is valid when unrelated to any existing root folder", () => {
    const service = fakeRootFolderService(["/books"]);
    expect(isNotAncestorOfExistingRootFolder(service as IRootFolderService, "/audiobooks")).toBe(
      true
    );
  });
});
