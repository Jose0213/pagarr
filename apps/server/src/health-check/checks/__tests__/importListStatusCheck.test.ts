import { describe, expect, it } from "vitest";
import type { ProviderStatusBase } from "../../../thingi-provider/status/ProviderStatusBase.js";
import { createProviderStatusBase } from "../../../thingi-provider/status/ProviderStatusBase.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import {
  ImportListStatusCheck,
  type ImportListProviderLike,
  type ImportListFactoryProviderLike,
  type ImportListStatusServiceLike,
} from "../importListStatusCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/ImportListStatusCheckFixture.cs. */

function factoryOf(providers: ImportListProviderLike[]): ImportListFactoryProviderLike {
  return { getAvailableProviders: () => providers };
}

function statusServiceOf(blocked: ProviderStatusBase[]): ImportListStatusServiceLike {
  return { getBlockedProviders: () => blocked };
}

function givenImportList(
  providers: ImportListProviderLike[],
  blocked: ProviderStatusBase[],
  id: number,
  backoffHours: number,
  failureHours: number
): void {
  providers.push({ definition: { id, name: `List${id}` } });

  if (backoffHours !== 0) {
    const now = Date.now();
    blocked.push(
      createProviderStatusBase({
        providerId: id,
        initialFailure: new Date(now - failureHours * 60 * 60 * 1000).toISOString(),
        mostRecentFailure: new Date(now - 0.1 * 60 * 60 * 1000).toISOString(),
        escalationLevel: 5,
        disabledTill: new Date(now + backoffHours * 60 * 60 * 1000).toISOString(),
      })
    );
  }
}

describe("ImportListStatusCheck", () => {
  it("should_not_return_error_when_no_import_lists", () => {
    const check = new ImportListStatusCheck(
      factoryOf([]),
      statusServiceOf([]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_warning_if_import_list_unavailable", () => {
    const providers: ImportListProviderLike[] = [];
    const blocked: ProviderStatusBase[] = [];
    givenImportList(providers, blocked, 1, 10.0, 24.0);
    givenImportList(providers, blocked, 2, 0.0, 0.0);

    const check = new ImportListStatusCheck(
      factoryOf(providers),
      statusServiceOf(blocked),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_error_if_all_import_lists_unavailable", () => {
    const providers: ImportListProviderLike[] = [];
    const blocked: ProviderStatusBase[] = [];
    givenImportList(providers, blocked, 1, 10.0, 24.0);

    const check = new ImportListStatusCheck(
      factoryOf(providers),
      statusServiceOf(blocked),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Error);
  });

  it("should_return_warning_if_few_import_lists_unavailable", () => {
    const providers: ImportListProviderLike[] = [];
    const blocked: ProviderStatusBase[] = [];
    givenImportList(providers, blocked, 1, 10.0, 24.0);
    givenImportList(providers, blocked, 2, 10.0, 24.0);
    givenImportList(providers, blocked, 3, 0.0, 0.0);

    const check = new ImportListStatusCheck(
      factoryOf(providers),
      statusServiceOf(blocked),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });
});
