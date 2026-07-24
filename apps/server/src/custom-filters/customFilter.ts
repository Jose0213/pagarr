import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/CustomFilters/CustomFilter.cs.
 *
 * A saved UI filter preset ("show me all monitored authors missing files",
 * etc.) -- a small settings-table entity with no business logic of its own
 * beyond plain CRUD. Backing table: "CustomFilters" (see
 * db/migrations/0001_initial_setup.sql -- Id/Type/Label/Filters, all
 * present already; this port is the first module to actually read/write
 * it).
 *
 * `Filters` is C#'s `List<Dictionary<string, object>>` (serialized to the
 * `Filters` TEXT column as JSON, deserialized at the API layer into
 * `List<ExpandoObject>` -- see the real
 * `CustomFilterResourceMapper.ToResource`, which calls
 * `STJson.Deserialize<List<ExpandoObject>>(model.Filters)`). This port's
 * domain model keeps `filters` as the raw JSON string exactly as the
 * "Filters" column stores it (matching CustomFilter.cs's own `public string
 * Filters { get; set; }` -- the *model* class itself never deserializes
 * this column; only the API resource mapper does, one layer up). See
 * `http-api/resources/CustomFilters/CustomFilterResource.ts` for the
 * `string <-> object[]` conversion at the wire boundary, matching where the
 * real C# source does the same conversion.
 */
export interface CustomFilter extends ModelBase {
  type: string;
  label: string;
  /** Raw JSON text exactly as stored in the "Filters" column -- see module doc comment. */
  filters: string;
}
