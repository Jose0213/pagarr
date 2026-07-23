import type { IDatabase } from "../../db/database.js";
import type { ColumnMapping } from "../../db/basic-repository.js";
import type { IEventAggregator } from "../../db/events.js";
import { ExtraFileRepository, type IExtraFileRepository } from "../extraFileRepository.js";
import type { MetadataFile } from "./metadataFile.js";

/**
 * Ported from NzbDrone.Core/Extras/Metadata/Files/MetadataFileRepository.cs.
 * Backing table: MetadataFiles (see db/migrations/0001_initial_setup.sql --
 * already has AuthorId/Consumer/Type/RelativePath/LastUpdated/BookId/
 * BookFileId/Hash/Added/Extension columns, no new migration needed).
 */
const METADATA_EXTRA_COLUMNS: ColumnMapping<MetadataFile>[] = [
  { prop: "hash", column: "Hash" },
  { prop: "consumer", column: "Consumer" },
  { prop: "type", column: "Type" },
];

export type IMetadataFileRepository = IExtraFileRepository<MetadataFile>;

export class MetadataFileRepository
  extends ExtraFileRepository<MetadataFile>
  implements IMetadataFileRepository
{
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, "MetadataFiles", METADATA_EXTRA_COLUMNS, eventAggregator);
  }
}
