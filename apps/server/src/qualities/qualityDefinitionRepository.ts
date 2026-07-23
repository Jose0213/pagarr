/**
 * Ported from NzbDrone.Core/Qualities/QualityDefinitionRepository.cs.
 *
 * C# `QualityDefinitionRepository : BasicRepository<QualityDefinition>` adds
 * no behavior of its own beyond the generic CRUD surface. This TS port
 * mirrors that -- the only work here is declaring the column mapping
 * between `QualityDefinition`'s TS shape and the actual `QualityDefinitions`
 * table (see db/migrations/0001_initial_setup.sql):
 *
 *   CREATE TABLE "QualityDefinitions" (
 *     "Id" INTEGER PRIMARY KEY,
 *     "Quality" INTEGER NOT NULL UNIQUE,
 *     "Title" TEXT NOT NULL UNIQUE,
 *     "MinSize" REAL NULL,
 *     "MaxSize" REAL NULL
 *   );
 *
 * The `"Quality"` column stores the `Quality.Id` int (C#'s `AsInt32()`
 * column against the `Quality` property relied on a Dapper type handler
 * that (de)serializes `Quality` to/from its `Id` -- see
 * QualityIntConverterFixture.cs in the C# tests). `rowToModel`/`modelToRow`
 * below replicate that conversion explicitly since BasicRepository's
 * generic column mapping has no notion of per-column custom (de)serializers
 * (see basic-repository.ts's module doc comment on the reflection-to-
 * explicit-columns adaptation). `GroupName`/`GroupWeight`/`Weight` are not
 * persisted columns at all (see qualityDefinition.ts) so they round-trip as
 * `null`/`0` from the DB and must be filled in by the caller (
 * QualityDefinitionService does this via `withWeight`, matching the C#
 * source's own `WithWeight` step).
 */

import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import type { QualityDefinition } from "./qualityDefinition.js";
import { qualityFromId, type Quality } from "./quality.js";

/**
 * `BasicRepository`'s `ColumnMapping` maps a DB column 1:1 onto a model
 * property with only an optional `boolean` coercion. `QualityDefinition.
 * quality` is an object (`{ id, name }`), not a primitive, so it can't be
 * declared as an ordinary column entry -- the repository stores/reads the
 * `Quality` column (an int id) directly and reconstructs/deconstructs the
 * `Quality` object around the generic row mapping instead of trying to
 * shoehorn that into `ColumnMapping<QualityDefinition>`. `QualityDefinitionRow`
 * is that intermediate, storage-shaped representation (flat `qualityId`
 * instead of a nested `quality` object); `toModel`/`toRow` below convert
 * between it and the real `QualityDefinition` shape.
 */
interface QualityDefinitionRow {
  id: number;
  qualityId: number;
  title: string;
  minSize?: number | null;
  maxSize?: number | null;
}

const ROW_COLUMNS: ColumnMapping<QualityDefinitionRow>[] = [
  { prop: "qualityId", column: "Quality" },
  { prop: "title", column: "Title" },
  { prop: "minSize", column: "MinSize" },
  { prop: "maxSize", column: "MaxSize" },
];

function toModel(row: QualityDefinitionRow): QualityDefinition {
  return {
    id: row.id,
    quality: qualityFromId(row.qualityId),
    title: row.title,
    groupName: null,
    groupWeight: 0,
    weight: 0,
    minSize: row.minSize ?? null,
    maxSize: row.maxSize ?? null,
  };
}

function toRow(model: QualityDefinition): QualityDefinitionRow {
  return {
    id: model.id,
    qualityId: model.quality.id,
    title: model.title,
    minSize: model.minSize ?? null,
    maxSize: model.maxSize ?? null,
  };
}

/**
 * Thin wrapper: delegates all storage to a `BasicRepository<QualityDefinitionRow>`
 * (the "Quality" column is a plain int here) and converts to/from the real
 * `QualityDefinition` shape (with a hydrated `Quality` object) at the edges.
 * This keeps `BasicRepository` itself free of any Qualities-specific
 * knowledge, matching how the C# BasicRepository<T> has no notion of
 * QualityIntConverter -- that conversion lived in the Dapper type-handler
 * registration (`SqlMapper.AddTypeHandler`), external to the repository
 * class, and this file is the equivalent seam.
 */
class QualityDefinitionRowRepository extends BasicRepository<QualityDefinitionRow> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "QualityDefinitions", columns: ROW_COLUMNS, eventAggregator });
  }
}

export interface IQualityDefinitionRepository {
  all(): QualityDefinition[];
  get(id: number): QualityDefinition;
  find(id: number): QualityDefinition | undefined;
  insert(model: QualityDefinition): QualityDefinition;
  insertMany(models: QualityDefinition[]): QualityDefinition[];
  update(model: QualityDefinition): QualityDefinition;
  updateMany(models: QualityDefinition[]): void;
  delete(modelOrId: QualityDefinition | number): void;
  deleteMany(modelsOrIds: QualityDefinition[] | number[]): void;
  count(): number;
}

export class QualityDefinitionRepository implements IQualityDefinitionRepository {
  private readonly rows: QualityDefinitionRowRepository;

  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    this.rows = new QualityDefinitionRowRepository(database, eventAggregator);
  }

  all(): QualityDefinition[] {
    return this.rows.all().map(toModel);
  }

  get(id: number): QualityDefinition {
    return toModel(this.rows.get(id));
  }

  find(id: number): QualityDefinition | undefined {
    const row = this.rows.find(id);
    return row ? toModel(row) : undefined;
  }

  insert(model: QualityDefinition): QualityDefinition {
    return toModel(this.rows.insert(toRow(model)));
  }

  insertMany(models: QualityDefinition[]): QualityDefinition[] {
    return this.rows.insertMany(models.map(toRow)).map(toModel);
  }

  update(model: QualityDefinition): QualityDefinition {
    return toModel(this.rows.update(toRow(model)));
  }

  updateMany(models: QualityDefinition[]): void {
    this.rows.updateMany(models.map(toRow));
  }

  delete(modelOrId: QualityDefinition | number): void {
    this.rows.delete(typeof modelOrId === "number" ? modelOrId : toRow(modelOrId));
  }

  deleteMany(modelsOrIds: QualityDefinition[] | number[]): void {
    if (modelsOrIds.length === 0) {
      return;
    }

    if (typeof modelsOrIds[0] === "number") {
      this.rows.deleteMany(modelsOrIds as number[]);
    } else {
      this.rows.deleteMany((modelsOrIds as QualityDefinition[]).map(toRow));
    }
  }

  count(): number {
    return this.rows.count();
  }
}

/** Re-exported for callers that only need the `Quality` type alongside this repository. */
export type { Quality };
