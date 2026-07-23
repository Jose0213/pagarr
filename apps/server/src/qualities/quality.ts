/**
 * Ported from NzbDrone.Core/Qualities/Quality.cs.
 *
 * C# `Quality` is an `IEmbeddedDocument, IEquatable<Quality>` value object
 * with a small fixed set of static instances (Unknown, PDF, MOBI, ...) and
 * explicit int<->Quality conversion operators used throughout Readarr
 * (`(Quality)someInt`, `(int)someQuality`). TypeScript has no operator
 * overloading or explicit conversion operators, so:
 *   - The fixed instances are exposed as frozen `Quality` objects on the
 *     `Quality` namespace-like const object below (`Quality.Unknown`,
 *     `Quality.PDF`, ...), mirroring the C# static properties.
 *   - `(Quality)id` becomes `qualityFromId(id)`.
 *   - `(int)quality` is just `quality.id` -- Quality's `Id` field already is
 *     the int, no conversion function needed.
 *   - `==`/`!=` become `qualitiesEqual`/`qualitiesNotEqual` free functions
 *     (see equality note below); most call sites can just compare `.id`.
 *
 * C# quality instances are effectively singletons-by-value (Equals compares
 * only Id), but each static property getter allocates a *new* `Quality`
 * instance on every access (`public static Quality Unknown => new
 * Quality(0, "Unknown Text");`). This port instead allocates each constant
 * once at module load and freezes it -- functionally equivalent (equality
 * is by `id`, never by reference, exactly as in the C# `Equals` override)
 * and avoids needless churn. `qualitiesEqual`/`qualitiesNotEqual` compare by
 * `id`, matching `Quality.Equals`/`operator ==`.
 */

import { newQualityDefinition, type QualityDefinition } from "./qualityDefinition.js";

export interface Quality {
  readonly id: number;
  readonly name: string;
}

function makeQuality(id: number, name: string): Quality {
  return Object.freeze({ id, name });
}

/** Ported from `Quality.Equals(Quality other)` / `operator ==`: equality by Id only. */
export function qualitiesEqual(left: Quality | null | undefined, right: Quality | null | undefined): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }

  return left.id === right.id;
}

/** Ported from `Quality.operator !=`. */
export function qualitiesNotEqual(left: Quality | null | undefined, right: Quality | null | undefined): boolean {
  return !qualitiesEqual(left, right);
}

/** Ported from `Quality.ToString()`. */
export function qualityToString(quality: Quality): string {
  return quality.name;
}

const Unknown = makeQuality(0, "Unknown Text");
const PDF = makeQuality(1, "PDF");
const MOBI = makeQuality(2, "MOBI");
const EPUB = makeQuality(3, "EPUB");
const AZW3 = makeQuality(4, "AZW3");
const MP3 = makeQuality(10, "MP3");
const FLAC = makeQuality(11, "FLAC");
const M4B = makeQuality(12, "M4B");
const UnknownAudio = makeQuality(13, "Unknown Audio");

/** Ported from `Quality.All` (static readonly List<Quality>), in the C# source's declared order. */
const All: readonly Quality[] = [Unknown, PDF, MOBI, EPUB, AZW3, UnknownAudio, MP3, M4B, FLAC];

/**
 * Ported from `Quality.AllLookup` (a dense `Quality[]` array sized to the
 * max id, indexed directly by id for O(1) lookup). A `Map<number, Quality>`
 * is the more idiomatic TS equivalent of the same "index by id" intent and
 * behaves identically for `qualityFromId`'s purposes; the dense-array-sized-
 * to-max-id detail was a C#-array-allocation implementation choice, not
 * observable behavior.
 */
const AllLookup = new Map<number, Quality>(All.map((q) => [q.id, q]));

/**
 * Ported from `Quality.DefaultQualityDefinitions` (static readonly
 * HashSet<QualityDefinition>), the seed data QualityDefinitionService uses
 * to insert missing rows on startup and to look up each Quality's `Weight`
 * at read time (weight is not a persisted column -- see qualityDefinition.ts).
 * A plain array is used instead of a Set-like structure since QualityDefinition
 * objects aren't primitive-comparable in JS the way C#'s HashSet<T> (using
 * default reference equality, since QualityDefinition doesn't override
 * Equals) needs; iteration order matches the C# source exactly, which
 * matters since `.OrderBy(d => d.Weight)` call sites depend on stable input.
 */
const DefaultQualityDefinitions: readonly QualityDefinition[] = [
  newQualityDefinition(Unknown, { weight: 1, minSize: 0, maxSize: 350, groupWeight: 1 }),
  newQualityDefinition(PDF, { weight: 5, minSize: 0, maxSize: 350, groupWeight: 2 }),
  newQualityDefinition(MOBI, { weight: 10, minSize: 0, maxSize: 350, groupWeight: 10 }),
  newQualityDefinition(EPUB, { weight: 11, minSize: 0, maxSize: 350, groupWeight: 11 }),
  newQualityDefinition(AZW3, { weight: 12, minSize: 0, maxSize: 350, groupWeight: 12 }),
  newQualityDefinition(UnknownAudio, { weight: 50, minSize: 0, maxSize: 350, groupWeight: 50 }),
  newQualityDefinition(MP3, { weight: 100, minSize: 0, maxSize: 350, groupWeight: 100 }),
  newQualityDefinition(M4B, { weight: 105, minSize: 0, maxSize: 350, groupWeight: 105 }),
  newQualityDefinition(FLAC, { weight: 110, minSize: 0, maxSize: null, groupWeight: 110 }),
];

/**
 * Ported from `Quality.FindById(int id)` / `explicit operator Quality(int
 * id)`. Throws for any id that isn't 0 and isn't a known quality, matching
 * the C# `ArgumentException("ID does not match a known quality", nameof(id))`
 * (raised both for out-of-range ids and for in-range-but-unassigned slots in
 * `AllLookup`).
 */
export function qualityFromId(id: number): Quality {
  if (id === 0) {
    return Unknown;
  }

  const quality = AllLookup.get(id);

  if (quality === undefined) {
    throw new Error("ID does not match a known quality (Parameter 'id')");
  }

  return quality;
}

/**
 * Namespace-shaped export mirroring the C# `Quality` static surface
 * (`Quality.Unknown`, `Quality.All`, `Quality.FindById(id)`, ...) so ported
 * call sites elsewhere in the codebase can read the same way the C# source
 * does. The `Quality` *type* (the interface above) and this *value* share
 * the name on purpose -- exactly like C#, where `Quality` is simultaneously
 * the instance type and the static-member holder.
 */
export const Quality = {
  Unknown,
  PDF,
  MOBI,
  EPUB,
  AZW3,
  MP3,
  FLAC,
  M4B,
  UnknownAudio,
  All,
  AllLookup,
  DefaultQualityDefinitions,
  FindById: qualityFromId,
} as const;
