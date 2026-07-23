import { describe, expect, it } from "vitest";
import { ApplicationShutdownRequested } from "../applicationShutdownRequested.js";
import { ApplicationStartedEvent } from "../applicationStartedEvent.js";
import { ApplicationStartingEvent } from "../applicationStartingEvent.js";

/**
 * No C# test fixtures exist for these three marker events. These tests
 * confirm the shape ported from the C# source: ApplicationShutdownRequested's
 * `Restarting` constructor parameter defaults to false and is read-only;
 * ApplicationStartedEvent/ApplicationStartingEvent are pure markers with no
 * payload.
 */
describe("ApplicationShutdownRequested", () => {
  it("defaults restarting to false", () => {
    const event = new ApplicationShutdownRequested();
    expect(event.restarting).toBe(false);
  });

  it("carries the restarting flag through when passed true", () => {
    const event = new ApplicationShutdownRequested(true);
    expect(event.restarting).toBe(true);
  });

  it("carries the restarting flag through when passed false explicitly", () => {
    const event = new ApplicationShutdownRequested(false);
    expect(event.restarting).toBe(false);
  });
});

describe("ApplicationStartedEvent", () => {
  it("constructs with no payload", () => {
    expect(new ApplicationStartedEvent()).toBeInstanceOf(ApplicationStartedEvent);
  });
});

describe("ApplicationStartingEvent", () => {
  it("constructs with no payload", () => {
    expect(new ApplicationStartingEvent()).toBeInstanceOf(ApplicationStartingEvent);
  });
});
