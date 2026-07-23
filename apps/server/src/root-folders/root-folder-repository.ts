import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import { ModelAction, ModelEvent, NullEventAggregator, type IEventAggregator } from "../db/events.js";
import type { CalibreSettings, MonitorType, NewItemMonitorType } from "./root-folder.js";
import type { RootFolder } from "./root-folder.js";

/**
 * Ported from NzbDrone.Core/RootFolders/RootFolderRepository.cs.
 *
 * Row-shape deviation: C#'s Dapper-based BasicRepository<RootFolder> relies
 * on TableMapping's registered converters to transparently (de)serialize
 * `HashSet<int> DefaultTags` and the embedded `CalibreSettings` object
 * to/from the `RootFolders.DefaultTags`/`RootFolders.CalibreSettings` TEXT
 * columns as JSON -- the same JSON-embedded-document convention Readarr
 * uses throughout (`IEmbeddedDocument`, `EmbeddedDocumentConverter.cs`) for
 * every provider-settings-shaped column. Pagarr's `BasicRepository<TModel>`
 * (apps/server/src/db/basic-repository.ts) only special-cases `boolean`
 * columns in its `ColumnMapping` -- it has no JSON-column hook, and its
 * row<->model mapping methods are private, so a generic `"json"`
 * `ColumnMapping.type` can't be added without editing that shared file
 * (out of this module's scope; see task constraints).
 *
 * Instead, this repository is declared against an internal `RootFolderRow`
 * shape (`defaultTags`/`calibreSettings` as raw JSON strings) and every
 * public method converts to/from the real `RootFolder` domain shape
 * (`Set<number>` / structured object) at the boundary. This reproduces the
 * exact same externally-observable behavior as the C# original -- callers
 * of `RootFolderRepository` never see JSON strings -- just via an explicit
 * wrapper layer instead of a transparent Dapper converter.
 */
interface RootFolderRow {
  id: number;
  name: string | null;
  path: string;
  defaultMetadataProfileId: number;
  defaultQualityProfileId: number;
  defaultMonitorOption: number;
  defaultNewItemMonitorOption: number;
  defaultTags: string | null;
  isCalibreLibrary: boolean;
  calibreSettings: string | null;
}

const ROOT_FOLDER_COLUMNS: ColumnMapping<RootFolderRow>[] = [
  { prop: "path", column: "Path" },
  { prop: "name", column: "Name" },
  { prop: "defaultMetadataProfileId", column: "DefaultMetadataProfileId" },
  { prop: "defaultQualityProfileId", column: "DefaultQualityProfileId" },
  { prop: "defaultMonitorOption", column: "DefaultMonitorOption" },
  { prop: "defaultNewItemMonitorOption", column: "DefaultNewItemMonitorOption" },
  { prop: "defaultTags", column: "DefaultTags" },
  { prop: "isCalibreLibrary", column: "IsCalibreLibrary", type: "boolean" },
  { prop: "calibreSettings", column: "CalibreSettings" },
];

function toRow(model: RootFolder): RootFolderRow {
  return {
    id: model.id,
    name: model.name,
    path: model.path,
    defaultMetadataProfileId: model.defaultMetadataProfileId,
    defaultQualityProfileId: model.defaultQualityProfileId,
    defaultMonitorOption: model.defaultMonitorOption,
    defaultNewItemMonitorOption: model.defaultNewItemMonitorOption,
    defaultTags: JSON.stringify([...model.defaultTags]),
    isCalibreLibrary: model.isCalibreLibrary,
    calibreSettings: model.calibreSettings ? JSON.stringify(model.calibreSettings) : null,
  };
}

/**
 * Computed-only fields (Accessible/FreeSpace/TotalSpace) default to their
 * C# zero-values here -- TableMapping.Map() `.Ignore()`s them for this
 * table, so a bare row-to-model conversion never has real values for them;
 * RootFolderService populates them after loading (see root-folder-service.ts).
 */
function fromRow(row: RootFolderRow): RootFolder {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    defaultMetadataProfileId: row.defaultMetadataProfileId,
    defaultQualityProfileId: row.defaultQualityProfileId,
    defaultMonitorOption: row.defaultMonitorOption as MonitorType,
    defaultNewItemMonitorOption: row.defaultNewItemMonitorOption as NewItemMonitorType,
    defaultTags: new Set(row.defaultTags ? (JSON.parse(row.defaultTags) as number[]) : []),
    isCalibreLibrary: row.isCalibreLibrary,
    calibreSettings: row.calibreSettings ? (JSON.parse(row.calibreSettings) as CalibreSettings) : null,
    accessible: false,
    freeSpace: null,
    totalSpace: null,
  };
}

export interface IRootFolderRepository {
  all(): RootFolder[];
  find(id: number): RootFolder | undefined;
  get(id: number): RootFolder;
  getMany(ids: number[]): RootFolder[];
  insert(model: RootFolder): RootFolder;
  update(model: RootFolder): RootFolder;
  delete(id: number): void;
  count(): number;
  hasItems(): boolean;
}

/**
 * `RootFolderRow`-typed inner repository with `PublishModelEvents => true`
 * baked in, matching RootFolderRepository.cs's
 * `protected override bool PublishModelEvents => true;`. Kept as a tiny
 * private subclass (rather than passed some other way) since
 * `publishModelEvents` is a protected getter on BasicRepository -- this is
 * the only place that needs to override it.
 */
class PublishingRootFolderRowRepository extends BasicRepository<RootFolderRow> {
  protected override get publishModelEvents(): boolean {
    return true;
  }
}

export class RootFolderRepository implements IRootFolderRepository {
  private readonly inner: PublishingRootFolderRowRepository;
  private readonly eventAggregator: IEventAggregator;
  /** Mirrors RootFolderRepository.cs's `protected override bool PublishModelEvents => true;`. */
  private readonly publishModelEvents = true;

  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    this.eventAggregator = eventAggregator ?? new NullEventAggregator();
    this.inner = new PublishingRootFolderRowRepository(database, {
      tableName: "RootFolders",
      columns: ROOT_FOLDER_COLUMNS,
      eventAggregator: this.eventAggregator,
    });
  }

  all(): RootFolder[] {
    return this.inner.all().map(fromRow);
  }

  find(id: number): RootFolder | undefined {
    const row = this.inner.find(id);
    return row ? fromRow(row) : undefined;
  }

  get(id: number): RootFolder {
    return fromRow(this.inner.get(id));
  }

  getMany(ids: number[]): RootFolder[] {
    return this.inner.getMany(ids).map(fromRow);
  }

  insert(model: RootFolder): RootFolder {
    return fromRow(this.inner.insert(toRow(model)));
  }

  update(model: RootFolder): RootFolder {
    return fromRow(this.inner.update(toRow(model)));
  }

  count(): number {
    return this.inner.count();
  }

  hasItems(): boolean {
    return this.inner.hasItems();
  }

  /**
   * Ported from RootFolderRepository.Delete(int id): unlike the base
   * BasicRepository.Delete (silent, no event), this loads the model first,
   * removes it, then calls `ModelDeleted(model)` -- which, like all
   * `BasicRepository` event publication, is still gated on
   * `PublishModelEvents` (true here per `PublishingRootFolderRowRepository`
   * above, mirroring the C# override), it's just that the base `Delete`
   * doesn't call `ModelDeleted` at all, so `RootFolderRepository`'s C#
   * override (`new void Delete(int id)`, hiding the base method) exists
   * purely to add that call. Named `delete` here (id-only, matching the C#
   * override's actual signature) rather than accepting `RootFolder |
   * number` the way BasicRepository.delete does, since C#'s
   * `new void Delete(int id)` only ever hides the `int` overload.
   */
  delete(id: number): void {
    const model = this.get(id);
    this.inner.delete(id);
    if (this.publishModelEvents) {
      this.eventAggregator.publishEvent(new ModelEvent(model, ModelAction.Deleted));
    }
  }
}
