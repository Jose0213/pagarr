import type { DownloadClientItem, IProvideDownloadClient } from "./downloadClients.js";

/**
 * Ported from NzbDrone.Core/Download/ProvideImportItemService.cs.
 *
 * `getImportItem` is `Promise<DownloadClientItem> | DownloadClientItem` on
 * the real `download-clients` `IDownloadClient` (wider than C#'s
 * synchronous `GetImportItem` -- see that interface's doc comment), so this
 * method is now `async`/awaits the result; existing callers already treat
 * `provideImportItem` as return-a-value (see `completedDownloadService.ts`'s
 * `setImportItem`), which now needs to `await` it too.
 *
 * `item.downloadClientInfo.id` -- C#'s `DownloadClientInfo` is not
 * null-checked before `.Id` (a real `DownloadClientItemClientInfo` is always
 * populated by the time an item reaches this method: `TrackedDownloadService.
 * trackDownload`/`DownloadMonitoringService.processClientDownloads` only
 * ever operate on items freshly returned by a live `IDownloadClient.getItems()`
 * call, which always stamps `downloadClientInfo` via
 * `DownloadClientItemClientInfo.FromDownloadClient`). The real TS port's
 * `DownloadClientItem.downloadClientInfo` is nullable at the type level
 * (default-constructed value, see download-clients/DownloadClientItem.ts) --
 * throwing here on an unpopulated item mirrors the C# NullReferenceException
 * that would occur on the same invariant violation, rather than silently
 * swallowing it.
 */
export interface IProvideImportItemService {
  provideImportItem(
    item: DownloadClientItem,
    previousImportAttempt: DownloadClientItem | null
  ): Promise<DownloadClientItem>;
}

export class ProvideImportItemService implements IProvideImportItemService {
  constructor(private readonly downloadClientProvider: IProvideDownloadClient) {}

  async provideImportItem(
    item: DownloadClientItem,
    previousImportAttempt: DownloadClientItem | null
  ): Promise<DownloadClientItem> {
    if (item.downloadClientInfo === null) {
      throw new Error("item.downloadClientInfo must not be null");
    }
    const client = this.downloadClientProvider.get(item.downloadClientInfo.id);
    return await client.getImportItem(item, previousImportAttempt);
  }
}
