import { describe, expect, it } from "vitest";
import type { IProvideDownloadClient } from "../../../download-clients/DownloadClientProvider.js";
import type { IDownloadClient } from "../../../download-clients/IDownloadClient.js";
import { createDownloadClientDefinition } from "../../../download-clients/DownloadClientDefinition.js";
import { createDownloadClientInfo } from "../../../download-clients/DownloadClientInfo.js";
import {
  DownloadClientAuthenticationException,
  DownloadClientException,
  DownloadClientUnavailableException,
} from "../../../download-clients/DownloadClientException.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { DownloadClientRemovesCompletedDownloadsCheck } from "../downloadClientRemovesCompletedDownloadsCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/DownloadClientRemovesCompletedDownloadsCheckFixture.cs. */

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

describe("DownloadClientRemovesCompletedDownloadsCheck", () => {
  it("should_return_warning_if_removing_completed_downloads_is_enabled", async () => {
    const client = fakeClient(() =>
      createDownloadClientInfo({ isLocalhost: true, removesCompletedDownloads: true })
    );
    const check = new DownloadClientRemovesCompletedDownloadsCheck(
      providerReturning(client),
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_ok_if_remove_completed_downloads_is_not_enabled", async () => {
    const client = fakeClient(() =>
      createDownloadClientInfo({ isLocalhost: true, removesCompletedDownloads: false })
    );
    const check = new DownloadClientRemovesCompletedDownloadsCheck(
      providerReturning(client),
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
    const check = new DownloadClientRemovesCompletedDownloadsCheck(
      providerReturning(client),
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Ok);
  });
});
