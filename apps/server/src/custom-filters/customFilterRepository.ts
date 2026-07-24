import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import type { CustomFilter } from "./customFilter.js";

/**
 * Ported from NzbDrone.Core/CustomFilters/CustomFilterRepository.cs.
 *
 * C#'s `ICustomFilterRepository : IBasicRepository<CustomFilter>` adds no
 * methods of its own beyond `IBasicRepository<T>` -- a plain marker
 * interface over the base CRUD surface, same shape as e.g.
 * `root-folders/root-folder-repository.ts`'s simplest cases. Follows this
 * port's established `BasicRepository<TModel>` pattern exactly (see
 * db/basic-repository.ts's doc comment, and tags/tagRepository.ts as the
 * smallest reference example this file was modeled on, per this task's
 * brief).
 */
const CUSTOM_FILTER_COLUMNS: ColumnMapping<CustomFilter>[] = [
  { prop: "type", column: "Type" },
  { prop: "label", column: "Label" },
  { prop: "filters", column: "Filters" },
];

export class CustomFilterRepository extends BasicRepository<CustomFilter> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, {
      tableName: "CustomFilters",
      columns: CUSTOM_FILTER_COLUMNS,
      eventAggregator,
    });
  }
}
