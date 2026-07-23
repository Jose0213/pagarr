import { describe, expect, it, vi } from "vitest";
import { Debouncer } from "../debouncer.js";

describe("Debouncer", () => {
  it("invokes the action after the debounce duration elapses", async () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const debouncer = new Debouncer(action, 100);

    debouncer.execute();
    expect(action).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(action).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("does not fire while paused, and fires once on resume if triggered during the pause", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const debouncer = new Debouncer(action, 100);

    debouncer.pause();
    debouncer.execute();
    vi.advanceTimersByTime(500);
    expect(action).not.toHaveBeenCalled();

    debouncer.resume();
    vi.advanceTimersByTime(100);
    expect(action).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("does not fire on resume if never triggered while paused", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const debouncer = new Debouncer(action, 100);

    debouncer.pause();
    debouncer.resume();
    vi.advanceTimersByTime(1000);

    expect(action).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("resets the timer on repeated execute() calls (debounces bursts into one call)", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const debouncer = new Debouncer(action, 100);

    debouncer.execute();
    vi.advanceTimersByTime(50);
    debouncer.execute();
    vi.advanceTimersByTime(50);
    expect(action).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(action).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
