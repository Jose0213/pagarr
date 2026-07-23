import type { IDatabase } from "../../db/database.js";
import { BasicRepository, type ColumnMapping } from "../../db/basic-repository.js";
import type { IEventAggregator } from "../../db/events.js";
import type { NamingConfig } from "./namingConfig.js";

/**
 * Ported from NzbDrone.Core/Organizer/NamingConfigRepository.cs.
 *
 * Unlike RootFolders (see root-folders/root-folder-repository.ts), every
 * `NamingConfig` column is a plain primitive (bool/int/string) -- no
 * embedded-JSON columns -- so this can use `BasicRepository<NamingConfig>`
 * directly with no row<->model conversion wrapper.
 */
const NAMING_CONFIG_COLUMNS: ColumnMapping<NamingConfig>[] = [
  { prop: "renameBooks", column: "RenameBooks", type: "boolean" },
  { prop: "replaceIllegalCharacters", column: "ReplaceIllegalCharacters", type: "boolean" },
  { prop: "colonReplacementFormat", column: "ColonReplacementFormat" },
  { prop: "standardBookFormat", column: "StandardBookFormat" },
  { prop: "authorFolderFormat", column: "AuthorFolderFormat" },
];

export interface INamingConfigRepository {
  all(): NamingConfig[];
  single(): NamingConfig;
  singleOrDefault(): NamingConfig | undefined;
  insert(model: NamingConfig): NamingConfig;
  update(model: NamingConfig): NamingConfig;
  upsert(model: NamingConfig): NamingConfig;
}

export class NamingConfigRepository extends BasicRepository<NamingConfig> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, {
      tableName: "NamingConfig",
      columns: NAMING_CONFIG_COLUMNS,
      ...(eventAggregator ? { eventAggregator } : {}),
    });
  }
}
