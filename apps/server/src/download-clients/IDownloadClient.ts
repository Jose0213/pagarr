import type { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { IIndexer } from "../indexers/IIndexer.js";
import type { DownloadClientDefinition } from "./DownloadClientDefinition.js";
import type { DownloadClientInfo } from "./DownloadClientInfo.js";
import type { DownloadClientItem } from "./DownloadClientItem.js";
import type { RemoteBookLike } from "./RemoteBookLike.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/IProvider.cs +
 * NzbDrone.Core/Download/IDownloadClient.cs.
 *
 * FORWARD-REFERENCE NARROWING: `IDownloadClient : IProvider`, where
 * `IProvider` (Name/ConfigContract/Message/DefaultDefinitions/Definition/
 * Test/RequestAction) lives in the not-yet-ported `ThingiProvider` module --
 * same rationale as `indexers/IIndexer.ts`'s identical doc comment. Its
 * members are inlined directly onto `IDownloadClient` here rather than
 * modeled as a separate `IProvider` interface, matching that precedent.
 */
export interface IDownloadClient {
  readonly name: string;
  readonly protocol: DownloadProtocol;

  definition: DownloadClientDefinition;

  download(remoteBook: RemoteBookLike, indexer: IIndexer | null): Promise<string | null>;
  getItems(): Promise<DownloadClientItem[]> | DownloadClientItem[];
  /**
   * `Promise<DownloadClientItem> | DownloadClientItem` -- wider than C#'s
   * synchronous `GetImportItem`, since this port's QBittorrent client needs
   * a network round trip (`GetTorrentFiles`/`GetTorrentProperties`) to
   * resolve the output path on API versions before 2.6.1 (see QBittorrent.ts's
   * `getImportItem` override), unlike Sabnzbd/Blackhole which resolve it
   * synchronously from data already in hand -- the base class's default
   * (`return item unchanged`) still returns synchronously.
   */
  getImportItem(
    item: DownloadClientItem,
    previousImportAttempt: DownloadClientItem | null
  ): Promise<DownloadClientItem> | DownloadClientItem;
  removeItem(item: DownloadClientItem, deleteData: boolean): Promise<void> | void;
  getStatus(): Promise<DownloadClientInfo> | DownloadClientInfo;
  /** Wider than C#'s synchronous `MarkItemAsImported` for the same network-round-trip reason as `getImportItem` above (QBittorrent's override calls `SetTorrentLabel`). */
  markItemAsImported(downloadClientItem: DownloadClientItem): Promise<void> | void;
  test(): Promise<import("../indexers/IIndexerSettings.js").ValidationResult>;
  requestAction(action: string, query: Record<string, string>): unknown;
}
