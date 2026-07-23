import { describe, expect, it } from "vitest";
import type { IProvideDownloadClient } from "../../../download-clients/DownloadClientProvider.js";
import type { IDownloadClient } from "../../../download-clients/IDownloadClient.js";
import { createDownloadClientDefinition } from "../../../download-clients/DownloadClientDefinition.js";
import { createDownloadClientInfo } from "../../../download-clients/DownloadClientInfo.js";
import { OsPath } from "../../../download-clients/OsPath.js";
import {
  DownloadClientAuthenticationException,
  DownloadClientException,
  DownloadClientUnavailableException,
} from "../../../download-clients/DownloadClientException.js";
import type { RootFolder } from "../../../root-folders/root-folder.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { DownloadClientRootFolderCheck } from "../downloadClientRootFolderCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/DownloadClientRootFolderCheckFixture.cs. */

const DOWNLOAD_ROOT_PATH = "/Test";

function fakeClient(getStatus: IDownloadClient["getStatus"]): IDownloadClient {
  return {
    name: "Test",
    protocol: 0,
    definition: createDownloadClientDefinition({ name: "Test" }),
    download: async () => null,
    getItems: () => [],
    getImportItem: (item) => item,
    removeItem: () => {},
    getStatus,
    markItemAsImported: () => {},
    test: async () => ({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => null,
  };
}

function providerReturning(client: IDownloadClient): IProvideDownloadClient {
  return {
    getDownloadClient: () => null,
    getDownloadClients: () => [client],
    get: () => client,
  };
}

function rootFolderServiceWith(path: string): { all: () => RootFolder[] } {
  return {
    all: () => [
      {
        id: 1,
        name: null,
        path,
        defaultMetadataProfileId: 0,
        defaultQualityProfileId: 0,
        defaultMonitorOption: 0,
        defaultNewItemMonitorOption: 0,
        defaultTags: new Set(),
        isCalibreLibrary: false,
        calibreSettings: null,
        accessible: true,
        freeSpace: null,
        totalSpace: null,
      },
    ],
  };
}

describe("DownloadClientRootFolderCheck", () => {
  it("should_return_downloads_in_root_folder_if_downloading_to_root_folder", async () => {
    const client = fakeClient(() =>
      createDownloadClientInfo({
        isLocalhost: true,
        outputRootFolders: [new OsPath(DOWNLOAD_ROOT_PATH)],
      })
    );
    const check = new DownloadClientRootFolderCheck(
      providerReturning(client),
      rootFolderServiceWith(DOWNLOAD_ROOT_PATH),
      new NullLocalizationService()
    );

    const result = await check.check();
    expect(result.type).toBe(HealthCheckResult.Warning);
    expect(result.wikiUrl!.toString()).toContain("downloads-in-root-folder");
  });

  it("should_return_ok_if_not_downloading_to_root_folder", async () => {
    const client = fakeClient(() =>
      createDownloadClientInfo({
        isLocalhost: true,
        outputRootFolders: [new OsPath(DOWNLOAD_ROOT_PATH)],
      })
    );
    const check = new DownloadClientRootFolderCheck(
      providerReturning(client),
      rootFolderServiceWith("/Test2"),
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Ok);
  });

  it.each([
    new DownloadClientUnavailableException("error"),
    new DownloadClientAuthenticationException("error"),
    new DownloadClientException("error"),
  ])("should_return_ok_if_client_throws_downloadclientexception (%#)", async (ex) => {
    const client = fakeClient(() => {
      throw ex;
    });
    const check = new DownloadClientRootFolderCheck(
      providerReturning(client),
      rootFolderServiceWith(DOWNLOAD_ROOT_PATH),
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Ok);
  });
});
