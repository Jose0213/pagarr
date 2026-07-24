import { describe, expect, it, vi } from "vitest";
import { importListExclusionExists } from "../ImportListExclusionExistsValidator.js";
import type { IImportListExclusionService } from "../ImportListExclusionService.js";

function fakeService(existingForeignIds: string[]): IImportListExclusionService {
  return {
    add: vi.fn(),
    all: vi.fn(() =>
      existingForeignIds.map((foreignId, i) => ({ id: i + 1, foreignId, name: "x" }))
    ),
    delete: vi.fn(),
    deleteByForeignId: vi.fn(),
    get: vi.fn(),
    findByForeignId: vi.fn(),
    findByForeignIds: vi.fn(() => []),
    update: vi.fn(),
    handleAuthorDeleted: vi.fn(),
    handleBookDeleted: vi.fn(),
  };
}

describe("importListExclusionExists", () => {
  it("returns true when an exclusion with the same ForeignId already exists", () => {
    expect(importListExclusionExists(fakeService(["gr-1", "gr-2"]), "gr-1")).toBe(true);
  });

  it("returns false when no exclusion matches", () => {
    expect(importListExclusionExists(fakeService(["gr-1"]), "gr-999")).toBe(false);
  });

  it("returns false (i.e. the validator's IsValid check passes) when foreignId is null/undefined -- matches C#'s 'context.PropertyValue == null' early-out returning true (no PropertyValidator failure)", () => {
    const service = fakeService(["gr-1"]);
    expect(importListExclusionExists(service, null)).toBe(false);
    expect(importListExclusionExists(service, undefined)).toBe(false);
  });
});
