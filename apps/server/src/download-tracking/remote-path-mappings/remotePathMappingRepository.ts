import type { IDatabase } from "../../db/database.js";
import { BasicRepository, type ColumnMapping } from "../../db/basic-repository.js";
import type { IEventAggregator } from "../../db/events.js";
import type { RemotePathMapping } from "./remotePathMapping.js";

/**
 * Ported from NzbDrone.Core/RemotePathMappings/RemotePathMappingRepository.cs.
 *
 * C#'s `PublishModelEvents => true` override plus its `new void Delete(int id)`
 * (which re-fetches the model first so the published `ModelEvent` carries
 * the deleted row's data, then explicitly calls `ModelDeleted(model)` on top
 * of whatever the base `Delete` already published) are both ported below:
 * `publishModelEvents` returns `true`, and `delete()` is overridden to
 * fetch-then-delete-then-publish, matching the C# source's shape (base
 * `BasicRepository.Delete(int id)` in C# does NOT publish a ModelEvent
 * itself -- only Insert/Update do, per BasicRepository.cs -- so this
 * `RemotePathMappingRepository`-level override is what actually makes
 * deletes observable).
 */
const REMOTE_PATH_MAPPING_COLUMNS: ColumnMapping<RemotePathMapping>[] = [
  { prop: "host", column: "Host" },
  { prop: "remotePath", column: "RemotePath" },
  { prop: "localPath", column: "LocalPath" },
];

export class RemotePathMappingRepository extends BasicRepository<RemotePathMapping> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, {
      tableName: "RemotePathMappings",
      columns: REMOTE_PATH_MAPPING_COLUMNS,
      eventAggregator,
    });
  }

  protected override get publishModelEvents(): boolean {
    return true;
  }

  /** Ported from `RemotePathMappingRepository`'s `new void Delete(int id)`. */
  override delete(modelOrId: RemotePathMapping | number): void {
    const model = typeof modelOrId === "number" ? this.get(modelOrId) : modelOrId;
    super.delete(model);
    this.modelDeleted(model, true);
  }
}
