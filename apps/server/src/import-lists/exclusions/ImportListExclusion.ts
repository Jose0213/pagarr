import type { ModelBase } from "../../db/model-base.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Exclusions/ImportListExclusion.cs.
 * Backing table: `ImportListExclusions` (migration 0001).
 *
 * This is the ImportLists-specific "never re-add this author/book" blocklist
 * entry -- distinct from the download-pipeline `Blocklisting` module already
 * ported (which blocks specific *releases* from being grabbed again, not
 * authors/books from being *added*).
 */
export interface ImportListExclusion extends ModelBase {
  foreignId: string;
  name: string;
}

export function createImportListExclusion(
  overrides: Partial<ImportListExclusion> = {}
): ImportListExclusion {
  return {
    id: 0,
    foreignId: "",
    name: "",
    ...overrides,
  };
}
