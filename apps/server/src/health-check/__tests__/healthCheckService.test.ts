import { beforeEach, describe, expect, it } from "vitest";
import { CheckOnCondition, checkOn } from "../checkOnAttribute.js";
import { createHealthCheck, createOkHealthCheck, HealthCheckResult } from "../healthCheck.js";
import { HealthCheckCompleteEvent } from "../healthCheckCompleteEvent.js";
import { HealthCheckFailedEvent } from "../healthCheckFailedEvent.js";
import { checkOnConditionFor, type ICheckOnCondition } from "../iCheckOnCondition.js";
import type { IProvideHealthCheck } from "../iProvideHealthCheck.js";
import { HealthCheckService, type HealthCheckRegistration } from "../healthCheckService.js";
import type { IServerSideNotificationService } from "../serverSideNotificationService.js";
import type { CheckHealthCommand } from "../checkHealthCommand.js";
import { CommandTrigger } from "../../messaging/index.js";
import { EventAggregator } from "../../messaging/events/eventAggregator.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/HealthCheckServiceFixture.cs. */

class FakeEvent {
  shouldExecute = false;
}

class FakeEvent2 {
  shouldExecute = false;
}

class FakeHealthCheck implements IProvideHealthCheck, ICheckOnCondition<FakeEvent> {
  get checkOnStartup(): boolean {
    return false;
  }

  get checkOnSchedule(): boolean {
    return false;
  }

  executed = false;

  check() {
    this.executed = true;
    return createOkHealthCheck(FakeHealthCheck);
  }

  shouldCheckOnEvent(message: FakeEvent): boolean {
    return message.shouldExecute;
  }
}

function noopServerSideNotificationService(): IServerSideNotificationService {
  return { getServerChecks: async () => [] };
}

describe("HealthCheckService", () => {
  let healthCheck: FakeHealthCheck;
  let eventAggregator: EventAggregator;
  let service: HealthCheckService;

  beforeEach(() => {
    healthCheck = new FakeHealthCheck();
    // Ported from the C# fixture's `FakeHealthCheck : ICheckOnCondition<FakeEvent>` --
    // NOT `ICheckOnCondition<FakeEvent2>` -- see iCheckOnCondition.ts's doc
    // comment for why this explicit registration is required to faithfully
    // reproduce that reified-generic distinction in TS.
    checkOnConditionFor(healthCheck, FakeEvent);
    eventAggregator = new EventAggregator();

    const registrations: HealthCheckRegistration[] = [
      {
        check: healthCheck,
        checkOn: [
          checkOn(FakeEvent, CheckOnCondition.Always),
          checkOn(FakeEvent2, CheckOnCondition.Always),
        ],
      },
    ];

    // Far in the past so the "startup grace period" branch in handleAsync
    // never fires during these tests, matching the C# fixture's implicit
    // assumption (it never advances time either).
    service = new HealthCheckService(
      registrations,
      noopServerSideNotificationService(),
      eventAggregator,
      { now: () => Date.now() },
      Date.now()
    );
  });

  it("should_not_execute_conditional", async () => {
    await service.handleAsync(new FakeEvent());

    expect(healthCheck.executed).toBe(false);
  });

  it("should_execute_conditional", async () => {
    const event = new FakeEvent();
    event.shouldExecute = true;

    await service.handleAsync(event);

    expect(healthCheck.executed).toBe(true);
  });

  it("should_execute_unconditional", async () => {
    await service.handleAsync(new FakeEvent2());

    expect(healthCheck.executed).toBe(true);
  });

  it("ignores its own HealthCheckCompleteEvent to avoid a publish loop", async () => {
    await expect(service.handleAsync(new HealthCheckCompleteEvent())).resolves.toBeUndefined();
    expect(healthCheck.executed).toBe(false);
  });

  it("results() reflects the cached failures after a manual Execute()", async () => {
    class FailingCheck implements IProvideHealthCheck {
      checkOnStartup = true;
      checkOnSchedule = true;
      check() {
        return createHealthCheck(FailingCheck, HealthCheckResult.Warning, "uh oh");
      }
    }

    const failing = new FailingCheck();
    const svc = new HealthCheckService(
      [{ check: failing }],
      noopServerSideNotificationService(),
      eventAggregator
    );

    const command: CheckHealthCommand = { trigger: CommandTrigger.Manual } as CheckHealthCommand;
    await svc.execute(command);

    const results = svc.results();
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe(HealthCheckResult.Warning);
    expect(results[0]!.message).toBe("uh oh");
  });

  it("results() clears a previously-failed check once it reports Ok", async () => {
    let shouldFail = true;

    class FlakyCheck implements IProvideHealthCheck {
      checkOnStartup = true;
      checkOnSchedule = true;
      check() {
        return shouldFail
          ? createHealthCheck(FlakyCheck, HealthCheckResult.Error, "broken")
          : createOkHealthCheck(FlakyCheck);
      }
    }

    const flaky = new FlakyCheck();
    const svc = new HealthCheckService(
      [{ check: flaky }],
      noopServerSideNotificationService(),
      eventAggregator
    );

    const command: CheckHealthCommand = { trigger: CommandTrigger.Manual } as CheckHealthCommand;
    await svc.execute(command);
    expect(svc.results()).toHaveLength(1);

    shouldFail = false;
    await svc.execute(command);
    expect(svc.results()).toHaveLength(0);
  });

  it("publishes HealthCheckFailedEvent only the first time a check fails, not on every subsequent failing run", async () => {
    class AlwaysFails implements IProvideHealthCheck {
      checkOnStartup = true;
      checkOnSchedule = true;
      check() {
        return createHealthCheck(AlwaysFails, HealthCheckResult.Error, "still broken");
      }
    }

    const failedEvents: HealthCheckFailedEvent[] = [];
    eventAggregator.subscribeAsync(HealthCheckFailedEvent, {
      handleAsync: (e) => {
        failedEvents.push(e);
      },
    });

    const svc = new HealthCheckService(
      [{ check: new AlwaysFails() }],
      noopServerSideNotificationService(),
      eventAggregator
    );

    const command: CheckHealthCommand = { trigger: CommandTrigger.Manual } as CheckHealthCommand;
    await svc.execute(command);
    await svc.execute(command);

    // Allow the fire-and-forget async handler to run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(failedEvents).toHaveLength(1);
  });

  it("publishes HealthCheckCompleteEvent after every performHealthCheck run", async () => {
    let completeCount = 0;
    eventAggregator.subscribe(HealthCheckCompleteEvent, {
      handle: () => {
        completeCount++;
      },
    });

    const command: CheckHealthCommand = { trigger: CommandTrigger.Manual } as CheckHealthCommand;
    await service.execute(command);

    expect(completeCount).toBe(1);
  });
});
