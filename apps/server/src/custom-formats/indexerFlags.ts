import { IndexerFlags } from "../parser/model/releaseInfo.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/ReleaseInfo.cs's `[Flags] public
 * enum IndexerFlags`.
 *
 * RECONCILED at Phase 2 merge review: this used to be a local forward-ref
 * re-declaration of the enum (CustomFormats was ported in a worktree
 * parallel to Parser, which owns the real type -- `IndexerFlags` is declared
 * in the same C# file as `ReleaseInfo`). Now that Parser has landed, this
 * imports and re-exports the real enum from parser/model/releaseInfo.ts
 * instead of redefining it -- caught by
 * @typescript-eslint/no-unsafe-enum-comparison once Prettier/ESLint were
 * wired in (two nominally different TS enum declarations with identical
 * values were being compared). `hasIndexerFlag`/`isDefinedIndexerFlag`
 * below stay here since they're CustomFormats-specific helpers, not part of
 * Parser's ported surface.
 */
export { IndexerFlags };

/** Ported from `Enum.HasFlag()` as used by `IndexerFlagSpecification.IsSatisfiedByWithoutNegate`. */
export function hasIndexerFlag(value: number, flag: IndexerFlags): boolean {
  const flagValue: number = flag;
  return (value & flagValue) === flagValue;
}

/** Ported from `Enum.IsDefined(typeof(IndexerFlags), flag)`, used by IndexerFlagSpecificationValidator. */
export function isDefinedIndexerFlag(value: number): boolean {
  return Object.values(IndexerFlags).includes(value);
}
