import { describe, expect, it } from "vitest";
import type { ProviderStatusBase } from "../../../thingi-provider/status/ProviderStatusBase.js";
import { createProviderStatusBase } from "../../../thingi-provider/status/ProviderStatusBase.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import {
  NotificationStatusCheck,
  type NotificationProviderLike,
  type NotificationFactoryLike,
  type NotificationStatusServiceLike,
} from "../notificationStatusCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/NotificationStatusCheckFixture.cs. */

function factoryOf(providers: NotificationProviderLike[]): NotificationFactoryLike {
  return { getAvailableProviders: () => providers };
}

function statusServiceOf(blocked: ProviderStatusBase[]): NotificationStatusServiceLike {
  return { getBlockedProviders: () => blocked };
}

function givenNotification(
  providers: NotificationProviderLike[],
  blocked: ProviderStatusBase[],
  id: number,
  backoffHours: number,
  failureHours: number
): void {
  providers.push({ definition: { id, name: `Notification${id}` } });

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

describe("NotificationStatusCheck", () => {
  it("should_not_return_error_when_no_notifications", () => {
    const check = new NotificationStatusCheck(
      factoryOf([]),
      statusServiceOf([]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_warning_if_notification_unavailable", () => {
    const providers: NotificationProviderLike[] = [];
    const blocked: ProviderStatusBase[] = [];
    givenNotification(providers, blocked, 1, 10.0, 24.0);
    givenNotification(providers, blocked, 2, 0.0, 0.0);

    const check = new NotificationStatusCheck(
      factoryOf(providers),
      statusServiceOf(blocked),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_error_if_all_notifications_unavailable", () => {
    const providers: NotificationProviderLike[] = [];
    const blocked: ProviderStatusBase[] = [];
    givenNotification(providers, blocked, 1, 10.0, 24.0);

    const check = new NotificationStatusCheck(
      factoryOf(providers),
      statusServiceOf(blocked),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Error);
  });

  it("should_return_warning_if_few_notifications_unavailable", () => {
    const providers: NotificationProviderLike[] = [];
    const blocked: ProviderStatusBase[] = [];
    givenNotification(providers, blocked, 1, 10.0, 24.0);
    givenNotification(providers, blocked, 2, 10.0, 24.0);
    givenNotification(providers, blocked, 3, 0.0, 0.0);

    const check = new NotificationStatusCheck(
      factoryOf(providers),
      statusServiceOf(blocked),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });
});
