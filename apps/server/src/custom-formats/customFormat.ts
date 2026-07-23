import type { ModelBase } from "../db/model-base.js";
import type { ICustomFormatSpecification } from "./specifications/customFormatSpecification.js";

/**
 * Ported from NzbDrone.Core/CustomFormats/CustomFormat.cs.
 *
 * C# `CustomFormat : ModelBase, IEquatable<CustomFormat>`. Equality-by-Id
 * (`Equals`/`GetHashCode`) is ported as a free function (`customFormatsEqual`)
 * per this port's "plain data + free functions" convention (see
 * qualities/quality.ts's `qualitiesEqual` for the identical pattern) rather
 * than as instance methods, since `CustomFormat` here is a plain interface.
 * `ToString()` (`=> Name`) is similarly a free function.
 *
 * RECONCILIATION (for the human reviewer, per this module's task brief):
 * `apps/server/src/profiles/customFormat.ts` currently defines a local
 * stand-in `{ id: number, name: string }` for exactly this type (Profiles
 * landed in Phase 1, before CustomFormats existed as a module). This real
 * `CustomFormat` is a structural superset of that stand-in -- same `id`/
 * `name` fields, plus `includeCustomFormatWhenRenaming` and `specifications`
 * that Profiles never touches. Any object satisfying this interface also
 * satisfies the stand-in's, so once the two modules are merged, Profiles'
 * `customFormat.ts` can be deleted and every `import type { CustomFormat }
 * from "../customFormat.js"` in profiles/** repointed at
 * `custom-formats/customFormat.js` with no call-site changes needed --
 * mirroring how Quality (Qualities module) was reconciled with Profiles'
 * own Quality references in Phase 1.
 */
export interface CustomFormat extends ModelBase {
  name: string;
  includeCustomFormatWhenRenaming: boolean;
  specifications: ICustomFormatSpecification[];
}

/** Ported from the `CustomFormat(string name, params ICustomFormatSpecification[] specs)` constructor overload. C# default for `IncludeCustomFormatWhenRenaming` is `false` (unset bool field). */
export function newCustomFormat(
  name = "",
  specifications: ICustomFormatSpecification[] = []
): CustomFormat {
  return {
    id: 0,
    name,
    includeCustomFormatWhenRenaming: false,
    specifications,
  };
}

/** Ported from `CustomFormat.ToString()`. */
export function customFormatToString(format: CustomFormat): string {
  return format.name;
}

/** Ported from `CustomFormat.Equals(CustomFormat other)` / `object.Equals` override: equality by Id only. */
export function customFormatsEqual(
  left: CustomFormat | null | undefined,
  right: CustomFormat | null | undefined
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }

  return left.id === right.id;
}
