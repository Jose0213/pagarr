import { describe, expect, it } from "vitest";
import { CheckOnCondition } from "../checkOnAttribute.js";
import { EventDrivenHealthCheck } from "../eventDrivenHealthCheck.js";
import { createOkHealthCheck } from "../healthCheck.js";
import { checkOnConditionFor, type ICheckOnCondition } from "../iCheckOnCondition.js";
import type { IProvideHealthCheck } from "../iProvideHealthCheck.js";

/** Translates the behavior EventDrivenHealthCheck.cs's ShouldExecute encodes (no dedicated C# fixture exists for this class in isolation -- it's exercised indirectly through HealthCheckServiceFixture). */

class PlainEvent {}

class PlainCheck implements IProvideHealthCheck {
  checkOnStartup = true;
  checkOnSchedule = true;
  check() {
    return createOkHealthCheck(PlainCheck);
  }
}

class FilteredEvent {
  allow = true;
}

class FilteringCheck implements IProvideHealthCheck, ICheckOnCondition<FilteredEvent> {
  checkOnStartup = true;
  checkOnSchedule = true;
  check() {
    return createOkHealthCheck(FilteringCheck);
  }
  shouldCheckOnEvent(message: FilteredEvent): boolean {
    return message.allow;
  }
}

describe("EventDrivenHealthCheck", () => {
  it("Always condition executes regardless of previous failure state", () => {
    const edhc = new EventDrivenHealthCheck(new PlainCheck(), CheckOnCondition.Always, PlainEvent);

    expect(edhc.shouldExecute(new PlainEvent(), false)).toBe(true);
    expect(edhc.shouldExecute(new PlainEvent(), true)).toBe(true);
  });

  it("FailedOnly condition only executes when previously failed", () => {
    const edhc = new EventDrivenHealthCheck(
      new PlainCheck(),
      CheckOnCondition.FailedOnly,
      PlainEvent
    );

    expect(edhc.shouldExecute(new PlainEvent(), false)).toBe(false);
    expect(edhc.shouldExecute(new PlainEvent(), true)).toBe(true);
  });

  it("SuccessfulOnly condition only executes when NOT previously failed", () => {
    const edhc = new EventDrivenHealthCheck(
      new PlainCheck(),
      CheckOnCondition.SuccessfulOnly,
      PlainEvent
    );

    expect(edhc.shouldExecute(new PlainEvent(), false)).toBe(true);
    expect(edhc.shouldExecute(new PlainEvent(), true)).toBe(false);
  });

  it("consults ICheckOnCondition.shouldCheckOnEvent when the check is registered for this event type", () => {
    const check = new FilteringCheck();
    checkOnConditionFor(check, FilteredEvent);

    const edhc = new EventDrivenHealthCheck<FilteredEvent>(
      check,
      CheckOnCondition.Always,
      FilteredEvent
    );

    expect(edhc.shouldExecute({ allow: true }, false)).toBe(true);
    expect(edhc.shouldExecute({ allow: false }, false)).toBe(false);
  });

  it("has a null eventFilter when the check implements shouldCheckOnEvent but was never registered for this event type (reified-generic distinction)", () => {
    const check = new FilteringCheck();
    // Deliberately NOT calling checkOnConditionFor(check, FilteredEvent) --
    // mirrors a class implementing ICheckOnCondition<SomeOtherEvent> but not
    // ICheckOnCondition<FilteredEvent> in the real C#.
    const edhc = new EventDrivenHealthCheck<FilteredEvent>(
      check,
      CheckOnCondition.Always,
      FilteredEvent
    );

    expect(edhc.eventFilter).toBeNull();
  });

  it("has a null eventFilter when the check does not implement ICheckOnCondition at all", () => {
    const edhc = new EventDrivenHealthCheck(new PlainCheck(), CheckOnCondition.Always, PlainEvent);

    expect(edhc.eventFilter).toBeNull();
  });
});
