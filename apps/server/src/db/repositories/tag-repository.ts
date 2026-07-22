import type { IDatabase } from "../database.js";
import { BasicRepository, type ColumnMapping } from "../basic-repository.js";
import type { ModelBase } from "../model-base.js";

/**
 * Example concrete repository proving BasicRepository<TModel> against a
 * real ported table (Tags, from Migration/001_initial_setup.cs). Mirrors
 * how a real Readarr `TagRepository : BasicRepository<Tag>` subclass would
 * be declared once TableMapping reflection is replaced with an explicit
 * column list (see basic-repository.ts's module doc comment).
 */
export interface Tag extends ModelBase {
  label: string;
}

const TAG_COLUMNS: ColumnMapping<Tag>[] = [{ prop: "label", column: "Label" }];

export class TagRepository extends BasicRepository<Tag> {
  constructor(database: IDatabase) {
    super(database, { tableName: "Tags", columns: TAG_COLUMNS });
  }
}
