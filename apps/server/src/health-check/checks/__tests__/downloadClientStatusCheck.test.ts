import { describe, expect, it } from "vitest";
import type { IProvideDownloadClient } from "../../../download-clients/DownloadClientProvider.js";
import type { IDownloadClient } from "../../../download-clients/IDownloadClient.js";
import { createDownloadClientDefinition } from "../../../download-clients/DownloadClientDefinition.js";
import type { DownloadClientStatus } from "../../../download-clients/DownloadClientStatus.js";
import { createDownloadClientStatus } from "../../../download-clients/DownloadClientStatus.js";
import type { IDownloadClientStatusService } from "../../../download-clients/DownloadClientStatusService.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { DownloadClientStatusCheck } from "../downloadClientStatusCheck.js";

/**
 * No dedicated C# fixture exists for DownloadClientStatusCheck (it shares
 * its shape with the well-tested IndexerStatusCheck/ImportListStatusCheck
 * siblings, whose fixtures ARE translated elsewhere in this suite) --
 * new tests written directly against this check's ported behavior.
 */

function fakeClient(id: number, name: string): IDownloadClient {
  return {
    name,
    protocol: 0,
    definition: createDownloadClientDefinition({ id, name, enable: true }),
    download: async () => null,
    getItems: () => [],
    getImportItem: (item) => item,
    removeItem: () => {},
    getStatus: () => {
      throw new Error("not used");
    },
    markItemAsImported: () => {},
    test: async () => ({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => null,
  };
}

function providerOf(clients: IDownloadClient[]): IProvideDownloadClient {
  return {
    getDownloadClient: () => null,
    getDownloadClients: () => clients,
    get: () => clients[0]!,
  };
}

function statusServiceOf(blocked: DownloadClientStatus[]): IDownloadClientStatusService {
  return {
    getBlockedProviders: () => blocked,
    recordSuccess: () => {},
    recordFailure: () => {},
    recordConnectionFailure: () => {},
  };
}

describe("DownloadClientStatusCheck", () => {
  it("returns Ok when no clients are configured", () => {
    const check = new DownloadClientStatusCheck(
      providerOf([]),
      statusServiceOf([]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Ok when no clients are blocked", () => {
    const check = new DownloadClientStatusCheck(
      providerOf([fakeClient(1, "qBit")]),
      statusServiceOf([]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Error when every client is blocked", () => {
    const check = new DownloadClientStatusCheck(
      providerOf([fakeClient(1, "qBit")]),
      statusServiceOf([createDownloadClientStatus({ providerId: 1 })]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Error);
  });

  it("returns Warning when only some clients are blocked", () => {
    const check = new DownloadClientStatusCheck(
      providerOf([fakeClient(1, "qBit"), fakeClient(2, "Sab")]),
      statusServiceOf([createDownloadClientStatus({ providerId: 1 })]),
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Warning);
  });
});
