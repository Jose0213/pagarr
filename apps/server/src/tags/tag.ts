import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Tags/Tag.cs.
 *
 * A `Tag` is just a `ModelBase` (auto-increment `Id`) plus a `Label`. The
 * `Label` is always lower-invariant by the time it reaches the repository --
 * see TagService.Add/Update, which lower-case it before persisting (matching
 * the C# source's `tag.Label = tag.Label.ToLowerInvariant();`).
 */
export interface Tag extends ModelBase {
  label: string;
}
