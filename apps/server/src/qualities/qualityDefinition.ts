/**
 * Ported from NzbDrone.Core/Qualities/QualityDefinition.cs.
 *
 * C# `QualityDefinition : ModelBase` also carries `GroupName`/`GroupWeight`,
 * but per the actual migrated schema (0001_initial_setup.sql's
 * `QualityDefinitions` table -- see db/migrations/) only `Quality`, `Title`,
 * `MinSize`, and `MaxSize` are persisted columns; `Weight` isn't a column
 * either. That matches the C# repository layer too: QualityDefinitionService
 * recomputes `Weight` on every read from `Quality.DefaultQualityDefinitions`
 * (see `WithWeight()` in QualityDefinitionService.cs) rather than trusting a
 * stored value, and nothing in the ported schema persists `GroupName`/
 * `GroupWeight` at all -- they exist on the in-memory
 * `Quality.DefaultQualityDefinitions` seed set but were never given their
 * own DB columns in Readarr either (grouping is Profiles-module concept,
 * ported separately). This interface still declares all of the C# model's
 * fields for shape-fidelity; `qualityDefinitionRepository.ts` documents
 * exactly which of them round-trip through SQLite.
 */

import type { ModelBase } from "../db/model-base.js";
import type { Quality } from "./quality.js";

export interface QualityDefinition extends ModelBase {
  quality: Quality;
  title: string;

  groupName?: string | null;
  groupWeight: number;
  weight: number;

  minSize?: number | null;
  maxSize?: number | null;
}

/**
 * Ported from `QualityDefinition(Quality quality)` -- the C# constructor
 * that seeds `Title` from `quality.Name`. `id: 0` matches every other
 * ported model's "not yet inserted" sentinel (see model-base.ts / the
 * BasicRepository insert()/update() id===0 conventions).
 */
export function newQualityDefinition(
  quality: Quality,
  overrides: Partial<Omit<QualityDefinition, "quality" | "id">> = {}
): QualityDefinition {
  return {
    id: 0,
    quality,
    title: quality.name,
    groupName: null,
    groupWeight: 0,
    weight: 0,
    minSize: null,
    maxSize: null,
    ...overrides,
  };
}

/** Ported from `QualityDefinition.ToString()`. */
export function qualityDefinitionToString(definition: QualityDefinition): string {
  return definition.quality.name;
}
