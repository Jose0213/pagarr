/**
 * Ported from NzbDrone.Core/Qualities/QualityModel.cs.
 *
 * C# `QualityModel : IEmbeddedDocument, IEquatable<QualityModel>,
 * IComparable`. As with Quality.cs/Revision.cs, operator overloads
 * (`==`/`!=`) become free functions, and `IComparable.CompareTo(object)`
 * becomes `compareQualityModels`. `QualityDetectionSource` is `[JsonIgnore]`
 * in the C# source (excluded from embedded-document serialization); this
 * port keeps that field optional and doesn't wire it into any (de)serializer
 * here, preserving the same "not persisted" behavior.
 */

import { Quality, type Quality as QualityType } from "./quality.js";
import { Revision } from "./revision.js";
import type { QualityDetectionSource } from "./qualityDetectionSource.js";

export interface QualityModel {
  quality: QualityType;
  revision: Revision;
  qualityDetectionSource?: QualityDetectionSource;
}

/**
 * Ported from the two `QualityModel` constructors: the parameterless one
 * (`Quality.Unknown`, `new Revision()`) and `QualityModel(Quality quality,
 * Revision revision = null)` (defaults `revision` to `new Revision()` when
 * omitted/null, matching `revision ?? new Revision()`).
 */
export function newQualityModel(
  quality: QualityType = Quality.Unknown,
  revision?: Revision | null
): QualityModel {
  return {
    quality,
    revision: revision ?? new Revision(),
  };
}

/** Ported from `QualityModel.ToString()`: "{Quality} {Revision}". */
export function qualityModelToString(model: QualityModel): string {
  return `${model.quality.name} ${model.revision.toString()}`;
}

/**
 * Ported from `QualityModel.CompareTo(object obj)`. Compares by each
 * quality's `Weight` in `Quality.DefaultQualityDefinitions` first (NOT by
 * Quality.Id -- this is the same weight-based ordering
 * QualityDefinitionService exposes), then falls back to `Revision.Real`,
 * then `Revision.Version`. Ported 1:1 including the C# source's
 * `.First(...)` lookup (throws if a quality has no matching default
 * definition, matching C#'s `InvalidOperationException` from `Enumerable.
 * First` finding no match).
 */
export function compareQualityModels(left: QualityModel, right: QualityModel): number {
  const definition = Quality.DefaultQualityDefinitions.find(
    (d) => d.quality.id === left.quality.id
  );
  const otherDefinition = Quality.DefaultQualityDefinitions.find(
    (d) => d.quality.id === right.quality.id
  );

  if (!definition || !otherDefinition) {
    throw new Error("Sequence contains no matching element");
  }

  if (definition.weight > otherDefinition.weight) {
    return 1;
  }

  if (definition.weight < otherDefinition.weight) {
    return -1;
  }

  if (left.revision.real > right.revision.real) {
    return 1;
  }

  if (left.revision.real < right.revision.real) {
    return -1;
  }

  if (left.revision.version > right.revision.version) {
    return 1;
  }

  if (left.revision.version < right.revision.version) {
    return -1;
  }

  return 0;
}

/** Ported from `QualityModel.Equals(QualityModel other)` / `operator ==`. */
export function qualityModelsEqual(
  left: QualityModel | null | undefined,
  right: QualityModel | null | undefined
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }

  return left.quality.id === right.quality.id && left.revision.equals(right.revision);
}

/** Ported from `QualityModel.operator !=`. */
export function qualityModelsNotEqual(
  left: QualityModel | null | undefined,
  right: QualityModel | null | undefined
): boolean {
  return !qualityModelsEqual(left, right);
}
