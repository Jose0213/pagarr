import { describe, expect, it } from "vitest";
import type { IProvideDownloadClient } from "../../../download-clients/DownloadClientProvider.js";
import type { IDownloadClient } from "../../../download-clients/IDownloadClient.js";
import { createDownloadClientDefinition } from "../../../download-clients/DownloadClientDefinition.js";
import { createDownloadClientInfo } from "../../../download-clients/DownloadClientInfo.js";
import { OsPath } from "../../../download-clients/OsPath.js";
import type { DownloadClientItem } from "../../../download-clients/DownloadClientItem.js";
import {
  DownloadClientAuthenticationException,
  DownloadClientException,
  DownloadClientUnavailableException,
} from "../../../download-clients/DownloadClientException.js";
import { TrackImportedEvent, TrackImportFailedEvent } from "../../../media-files-import/events.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { RemotePathMappingCheck } from "../remotePathMappingCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/RemotePathMappingCheckFixture.cs. */

const DOWNLOAD_ROOT_PATH = "/Test";
const DOWNLOAD_ITEM_PATH = "/Test/item";

function makeDownloadItem(): DownloadClientItem {
  return {
    downloadClientInfo: {
      protocol: 0,
      type: "Test",
      id: 1,
      name: "Test",
      hasPostImportCategory: false,
    },
    downloadId: "TestId",
    category: null,
    title: "",
    totalSize: 0,
    remainingSize: 0,
    remainingTime: null,
    seedRatio: null,
    outputPath: new OsPath(DOWNLOAD_ITEM_PATH),
    message: null,
    status: 0,
    isEncrypted: false,
    canMoveFiles: false,
    canBeRemoved: false,
    removed: false,
  };
}

interface Harness {
  check: RemotePathMappingCheck;
  folderExistsFor: Set<string>;
  fileExistsFor: Set<string>;
  clientStatus: ReturnType<typeof createDownloadClientInfo>;
  /** The SAME item instance `client.getItems()` returns -- mutate `.outputPath` in place (matching the real fixture's `_downloadItem.OutputPath = ...` mutation of the shared mock item) rather than passing a disconnected copy into an event. */
  downloadItem: DownloadClientItem;
  state: { getStatusThrows: Error | null; isDocker: boolean };
}

function buildHarness(): Harness {
  const folderExistsFor = new Set<string>();
  const fileExistsFor = new Set<string>();
  const state = { getStatusThrows: null as Error | null, isDocker: false };

  const clientStatus = createDownloadClientInfo({
    isLocalhost: true,
    outputRootFolders: [new OsPath(DOWNLOAD_ROOT_PATH)],
  });

  const downloadItem = makeDownloadItem();

  const client: IDownloadClient = {
    name: "Test",
    protocol: 0,
    definition: createDownloadClientDefinition({ name: "Test" }),
    download: async () => null,
    getItems: () => [downloadItem],
    getImportItem: (item) => item,
    removeItem: () => {},
    getStatus: () => {
      if (state.getStatusThrows) {
        throw state.getStatusThrows;
      }
      return clientStatus;
    },
    markItemAsImported: () => {},
    test: async () => ({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => null,
  };

  const downloadClientProvider: IProvideDownloadClient = {
    getDownloadClient: () => null,
    getDownloadClients: () => [client],
    get: () => client,
  };

  const check = new RemotePathMappingCheck(
    {
      folderExists: (p) => folderExistsFor.has(p),
      fileExists: (p) => fileExistsFor.has(p),
    },
    downloadClientProvider,
    { enableCompletedDownloadHandling: true },
    {
      name: "Windows",
      get isDocker() {
        return state.isDocker;
      },
    },
    new NullLocalizationService()
  );

  return { check, folderExistsFor, fileExistsFor, clientStatus, downloadItem, state };
}

describe("RemotePathMappingCheck", () => {
  it("should_return_ok_if_setup_correctly", async () => {
    const h = buildHarness();
    h.folderExistsFor.add(DOWNLOAD_ROOT_PATH);

    expect((await h.check.check()).type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_permissions_error_if_local_client_download_root_missing", async () => {
    const h = buildHarness();

    const result = await h.check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("permissions-error");
  });

  it("should_return_mapping_error_if_remote_client_root_path_invalid", async () => {
    const h = buildHarness();
    h.clientStatus.isLocalhost = false;
    h.clientStatus.outputRootFolders = [new OsPath("An invalid path")];

    const result = await h.check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("bad-remote-path-mapping");
  });

  it("should_return_download_client_error_if_local_client_root_path_invalid", async () => {
    const h = buildHarness();
    h.clientStatus.isLocalhost = true;
    h.clientStatus.outputRootFolders = [new OsPath("An invalid path")];

    const result = await h.check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("bad-download-client-settings");
  });

  it("should_return_path_mapping_error_if_remote_client_download_root_missing", async () => {
    const h = buildHarness();
    h.clientStatus.isLocalhost = false;

    const result = await h.check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("bad-remote-path-mapping");
  });

  it.each([
    new DownloadClientUnavailableException("error"),
    new DownloadClientAuthenticationException("error"),
    new DownloadClientException("error"),
  ])("should_return_ok_if_client_throws_downloadclientexception (%#)", async (ex) => {
    const h = buildHarness();
    h.state.getStatusThrows = ex;

    expect((await h.check.check()).type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_docker_path_mapping_error_if_on_docker_and_root_missing", async () => {
    const h = buildHarness();
    h.state.isDocker = true;

    const result = await h.check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("docker-bad-remote-path-mapping");
  });

  it("should_return_ok_on_book_imported_event (TrackImportedEvent is checkWithMessage's else-branch, falls back to check())", async () => {
    const h = buildHarness();
    h.folderExistsFor.add(DOWNLOAD_ROOT_PATH);

    const importEvent = new TrackImportedEvent({}, {} as never, [], true, makeDownloadItem());

    expect((await h.check.checkWithMessage(importEvent)).type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_permissions_error_on_book_import_failed_event_if_file_exists", async () => {
    const h = buildHarness();
    const trackPath = DOWNLOAD_ITEM_PATH + "/file.mp3";
    h.fileExistsFor.add(trackPath);

    const importEvent = new TrackImportFailedEvent(
      new Error(),
      { path: trackPath },
      true,
      makeDownloadItem()
    );

    const result = await h.check.checkWithMessage(importEvent);
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("permissions-error");
  });

  it("should_return_permissions_error_on_book_import_failed_event_if_folder_exists", async () => {
    const h = buildHarness();
    h.folderExistsFor.add(DOWNLOAD_ITEM_PATH);

    const importEvent = new TrackImportFailedEvent(null, null, true, makeDownloadItem());

    const result = await h.check.checkWithMessage(importEvent);
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("permissions-error");
  });

  it("should_return_permissions_error_on_book_import_failed_event_for_local_client_if_folder_does_not_exist", async () => {
    const h = buildHarness();

    const importEvent = new TrackImportFailedEvent(null, null, true, makeDownloadItem());

    const result = await h.check.checkWithMessage(importEvent);
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("permissions-error");
  });

  it("should_return_mapping_error_on_book_import_failed_event_for_remote_client_if_folder_does_not_exist", async () => {
    const h = buildHarness();
    h.clientStatus.isLocalhost = false;

    const importEvent = new TrackImportFailedEvent(null, null, true, makeDownloadItem());

    const result = await h.check.checkWithMessage(importEvent);
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("bad-remote-path-mapping");
  });

  it("should_return_mapping_error_on_book_import_failed_event_for_remote_client_if_path_invalid", async () => {
    const h = buildHarness();
    h.clientStatus.isLocalhost = false;
    // Mutate the SAME item instance `client.getItems()` returns -- see the
    // Harness interface's doc comment for why a disconnected copy wouldn't
    // be found by the check's `items.find(x => x.downloadId === ...)` lookup.
    h.downloadItem.outputPath = new OsPath("an invalid path");

    const importEvent = new TrackImportFailedEvent(null, null, true, h.downloadItem);

    const result = await h.check.checkWithMessage(importEvent);
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("bad-remote-path-mapping");
  });

  it("should_return_download_client_error_on_book_import_failed_event_for_remote_client_if_path_invalid", async () => {
    const h = buildHarness();
    h.clientStatus.isLocalhost = true;
    h.downloadItem.outputPath = new OsPath("an invalid path");

    const importEvent = new TrackImportFailedEvent(null, null, true, h.downloadItem);

    const result = await h.check.checkWithMessage(importEvent);
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("bad-download-client-settings");
  });

  it("should_return_docker_mapping_error_on_book_import_failed_event_inside_docker_if_folder_does_not_exist", async () => {
    const h = buildHarness();
    h.state.isDocker = true;
    h.clientStatus.isLocalhost = false;

    const importEvent = new TrackImportFailedEvent(null, null, true, makeDownloadItem());

    const result = await h.check.checkWithMessage(importEvent);
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("docker-bad-remote-path-mapping");
  });

  it.each([
    new DownloadClientUnavailableException("error"),
    new DownloadClientAuthenticationException("error"),
    new DownloadClientException("error"),
  ])(
    "should_return_ok_on_import_failed_event_if_client_throws_downloadclientexception (%#)",
    async (ex) => {
      const h = buildHarness();
      h.state.getStatusThrows = ex;

      const importEvent = new TrackImportFailedEvent(null, null, true, makeDownloadItem());

      expect((await h.check.checkWithMessage(importEvent)).type).toBe(HealthCheckResult.Ok);
    }
  );
});
