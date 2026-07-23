import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import type { Tag } from "./tag.js";

/**
 * Ported from NzbDrone.Core/Tags/TagRepository.cs.
 *
 * Relocated from the Phase-0 example at db/repositories/tag-repository.ts
 * (kept there purely to prove BasicRepository<TModel> against a real table)
 * into this module, which is the real Tags port -- see this module's PR
 * description for the "existing tag-repository.ts" note. `db/repositories/`
 * now re-exports from here for back-compat instead of duplicating the class.
 *
 * `GetByLabel`/`FindByLabel` mirror the C# source exactly:
 *  - `GetByLabel` throws `InvalidOperationException` if no tag has that
 *    label (ported as a plain `Error` with the same message text).
 *  - `FindByLabel` returns `undefined` (`null` in C#) instead of throwing.
 * Both are `Query(c => c.Label == label).SingleOrDefault()` in C#, which
 * throws if the query matches *more than one* row too -- the `Label` column
 * has a UNIQUE constraint (see db/migrations/0001_initial_setup.sql's
 * `Tags` table), so that branch is unreachable in practice, but `all()` +
 * `.find()` below preserves the "at most one" semantics for fidelity.
 */
const TAG_COLUMNS: ColumnMapping<Tag>[] = [{ prop: "label", column: "Label" }];

export class TagRepository extends BasicRepository<Tag> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "Tags", columns: TAG_COLUMNS, eventAggregator });
  }

  /** Ported from `TagRepository.GetByLabel`: throws if no tag has this label. */
  getByLabel(label: string): Tag {
    const model = this.findByLabel(label);

    if (model === undefined) {
      throw new Error("Didn't find tag with label " + label);
    }

    return model;
  }

  /** Ported from `TagRepository.FindByLabel`: `undefined` (C#'s `null`) if not found. */
  findByLabel(label: string): Tag | undefined {
    return this.all().find((tag) => tag.label === label);
  }
}
