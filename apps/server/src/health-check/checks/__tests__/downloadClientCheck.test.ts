import { describe, expect, it } from "vitest";
import type { IProvideDownloadClient } from "../../../download-clients/DownloadClientProvider.js";
import type { IDownloadClient } from "../../../download-clients/IDownloadClient.js";
import { createDownloadClientDefinition } from "../../../download-clients/DownloadClientDefinition.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { DownloadClientCheck } from "../downloadClientCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/DownloadClientCheckFixture.cs. */

function providerReturning(clients: IDownloadClient[]): IProvideDownloadClient {
  return {
    getDownloadClient: () => null,
    getDownloadClients: () => clients,
    get: () => {
      throw new Error("not used in these tests");
    },
  };
}

function fakeClient(overrides: Partial<IDownloadClient> = {}): IDownloadClient {
  return {
    name: "Test",
    protocol: 0,
    definition: createDownloadClientDefinition({ name: "Test" }),
    download: async () => null,
    getItems: () => [],
    getImportItem: (item) => item,
    removeItem: () => {},
    getStatus: () => {
      throw new Error("not used in these tests");
    },
    markItemAsImported: () => {},
    test: async () => ({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => null,
    ...overrides,
  };
}

describe("DownloadClientCheck", () => {
  it("should_return_warning_when_download_client_has_not_been_configured", async () => {
    const check = new DownloadClientCheck(providerReturning([]), new NullLocalizationService());

    const result = await check.check();

    expect(result.type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_error_when_download_client_throws", async () => {
    const client = fakeClient({
      getItems: () => {
        throw new Error("boom");
      },
    });

    const check = new DownloadClientCheck(
      providerReturning([client]),
      new NullLocalizationService()
    );

    const result = await check.check();

    expect(result.type).toBe(HealthCheckResult.Error);
  });

  it("should_return_ok_when_download_client_returns", async () => {
    const client = fakeClient({ getItems: () => [] });

    const check = new DownloadClientCheck(
      providerReturning([client]),
      new NullLocalizationService()
    );

    const result = await check.check();

    expect(result.type).toBe(HealthCheckResult.Ok);
  });
});
