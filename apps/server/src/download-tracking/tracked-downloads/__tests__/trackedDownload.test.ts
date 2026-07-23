import { describe, expect, it } from "vitest";
import {
  TrackedDownload,
  TrackedDownloadStatus,
  warnTrackedDownload,
  warnTrackedDownloadFormatted,
} from "../trackedDownload.js";
import { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import type { DownloadClientItem } from "../../downloadClients.js";
import { OsPath } from "../../../download-clients/OsPath.js";

function makeItem(): DownloadClientItem {
  return {
    downloadClientInfo: {
      protocol: DownloadProtocol.Torrent,
      type: "T",
      id: 1,
      name: "C",
      hasPostImportCategory: false,
    },
    downloadId: "dl-1",
    category: null,
    title: "My Download",
    totalSize: 0,
    remainingSize: 0,
    remainingTime: null,
    seedRatio: null,
    outputPath: OsPath.empty(),
    message: null,
    status: 2,
    isEncrypted: false,
    canMoveFiles: true,
    canBeRemoved: true,
    removed: false,
  };
}

describe("TrackedDownload warn helpers", () => {
  it("warnTrackedDownloadFormatted sets status to Warning and formats the message with the download item's title", () => {
    const trackedDownload = new TrackedDownload();
    trackedDownload.downloadItem = makeItem();

    warnTrackedDownloadFormatted(trackedDownload, "Failed with {0}", "reason A");

    expect(trackedDownload.status).toBe(TrackedDownloadStatus.Warning);
    expect(trackedDownload.statusMessages).toHaveLength(1);
    expect(trackedDownload.statusMessages[0]?.title).toBe("My Download");
    expect(trackedDownload.statusMessages[0]?.messages).toEqual(["Failed with reason A"]);
  });

  it("warnTrackedDownload sets multiple status messages directly", () => {
    const trackedDownload = new TrackedDownload();
    trackedDownload.downloadItem = makeItem();

    warnTrackedDownload(trackedDownload, [
      { title: "a", messages: ["m1"] },
      { title: "b", messages: ["m2"] },
    ]);

    expect(trackedDownload.status).toBe(TrackedDownloadStatus.Warning);
    expect(trackedDownload.statusMessages).toHaveLength(2);
  });

  it("defaults to Ok status and no messages on a fresh instance", () => {
    const trackedDownload = new TrackedDownload();
    expect(trackedDownload.status).toBe(TrackedDownloadStatus.Ok);
    expect(trackedDownload.statusMessages).toEqual([]);
  });
});
