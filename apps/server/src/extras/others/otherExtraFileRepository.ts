import type { IDatabase } from "../../db/database.js";
import type { ColumnMapping } from "../../db/basic-repository.js";
import type { IEventAggregator } from "../../db/events.js";
import { ExtraFileRepository, type IExtraFileRepository } from "../extraFileRepository.js";
import type { OtherExtraFile } from "./otherExtraFile.js";

/**
 * Ported from NzbDrone.Core/Extras/Others/OtherExtraFileRepository.cs.
 *
 * PRESERVED UPSTREAM QUIRK -- see otherExtraFile.ts's module doc comment:
 * there is no `OtherExtraFiles` table in any real Readarr migration. This
 * repository targets that (non-existent) table name faithfully; any method
 * call against a real database will throw a SQLite "no such table" error,
 * matching the real C# class's would-be SQL error against a real Readarr
 * database.
 */
const OTHER_EXTRA_FILE_COLUMNS: ColumnMapping<OtherExtraFile>[] = [];

export type IOtherExtraFileRepository = IExtraFileRepository<OtherExtraFile>;

export class OtherExtraFileRepository
  extends ExtraFileRepository<OtherExtraFile>
  implements IOtherExtraFileRepository
{
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, "OtherExtraFiles", OTHER_EXTRA_FILE_COLUMNS, eventAggregator);
  }
}
