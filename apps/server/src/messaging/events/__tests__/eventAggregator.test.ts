import { describe, expect, it, vi } from "vitest";
import { EventAggregator, NullEventAggregator } from "../eventAggregator.js";
import type { IHandle, IHandleAsync } from "../iHandle.js";
import type { IEvent } from "../iEvent.js";
import { EventHandleOrder } from "../../eventHandleOrder.js";

/** Ported from NzbDrone.Core.Test/Messaging/Events/EventAggregatorFixture.cs. */

class EventA implements IEvent {}
class EventB implements IEvent {}

describe("EventAggregator", () => {
  it("should_publish_event_to_handlers", () => {
    const aggregator = new EventAggregator();
    const handlerA1: IHandle<EventA> = { handle: vi.fn() };
    const handlerA2: IHandle<EventA> = { handle: vi.fn() };
    aggregator.subscribe(EventA, handlerA1);
    aggregator.subscribe(EventA, handlerA2);

    const eventA = new EventA();
    aggregator.publishEvent(eventA);

    expect(handlerA1.handle).toHaveBeenCalledWith(eventA);
    expect(handlerA1.handle).toHaveBeenCalledTimes(1);
    expect(handlerA2.handle).toHaveBeenCalledWith(eventA);
    expect(handlerA2.handle).toHaveBeenCalledTimes(1);
  });

  it("should_not_publish_to_incompatible_handlers", () => {
    const aggregator = new EventAggregator();
    const handlerA: IHandle<EventA> = { handle: vi.fn() };
    const handlerB1: IHandle<EventB> = { handle: vi.fn() };
    const handlerB2: IHandle<EventB> = { handle: vi.fn() };
    aggregator.subscribe(EventA, handlerA);
    aggregator.subscribe(EventB, handlerB1);
    aggregator.subscribe(EventB, handlerB2);

    aggregator.publishEvent(new EventA());

    expect(handlerA.handle).toHaveBeenCalledTimes(1);
    expect(handlerB1.handle).not.toHaveBeenCalled();
    expect(handlerB2.handle).not.toHaveBeenCalled();
  });

  it("broken_handler_should_not_effect_others_handler", () => {
    const aggregator = new EventAggregator();
    const handlerA1: IHandle<EventA> = {
      handle: vi.fn(() => {
        throw new Error("boom");
      }),
    };
    const handlerA2: IHandle<EventA> = { handle: vi.fn() };
    aggregator.subscribe(EventA, handlerA1);
    aggregator.subscribe(EventA, handlerA2);

    const eventA = new EventA();
    expect(() => aggregator.publishEvent(eventA)).not.toThrow();

    expect(handlerA1.handle).toHaveBeenCalledWith(eventA);
    expect(handlerA2.handle).toHaveBeenCalledWith(eventA);
  });

  it("reports the error from a broken handler via onError instead of throwing", () => {
    const onError = vi.fn();
    const aggregator = new EventAggregator({ onError });
    const error = new Error("boom");
    aggregator.subscribe(EventA, {
      handle: () => {
        throw error;
      },
    });

    aggregator.publishEvent(new EventA());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("EventA", expect.any(String), error);
  });

  it("dispatches sync handlers in EventHandleOrder (First, then Any, then Last)", () => {
    const aggregator = new EventAggregator();
    const order: string[] = [];

    aggregator.subscribe(EventA, { handle: () => order.push("last") }, EventHandleOrder.Last);
    aggregator.subscribe(EventA, { handle: () => order.push("any1") }, EventHandleOrder.Any);
    aggregator.subscribe(EventA, { handle: () => order.push("first") }, EventHandleOrder.First);
    aggregator.subscribe(EventA, { handle: () => order.push("any2") });

    aggregator.publishEvent(new EventA());

    expect(order).toEqual(["first", "any1", "any2", "last"]);
  });

  it("fires async handlers without blocking publishEvent (fire-and-forget)", async () => {
    const aggregator = new EventAggregator();
    let resolveHandler: () => void = () => {};
    const started = vi.fn();
    const finished = vi.fn();

    const asyncHandler: IHandleAsync<EventA> = {
      handleAsync: async () => {
        started();
        await new Promise<void>((resolve) => {
          resolveHandler = resolve;
        });
        finished();
      },
    };
    aggregator.subscribe(EventA, { handle: vi.fn() });
    aggregator.subscribeAsync(EventA, asyncHandler);

    aggregator.publishEvent(new EventA());

    // publishEvent returns synchronously without waiting for the async handler.
    expect(started).toHaveBeenCalledTimes(1);
    expect(finished).not.toHaveBeenCalled();

    resolveHandler();
    await Promise.resolve();
    await Promise.resolve();

    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected async handler's error via onError", async () => {
    const onError = vi.fn();
    const aggregator = new EventAggregator({ onError });
    const error = new Error("async boom");

    aggregator.subscribeAsync(EventA, {
      handleAsync: async () => {
        throw error;
      },
    });

    aggregator.publishEvent(new EventA());

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).toHaveBeenCalledWith("EventA", expect.any(String), error);
  });

  it("delivers every published event to global async handlers regardless of event type", () => {
    const aggregator = new EventAggregator();
    const globalHandler: IHandleAsync<IEvent> = { handleAsync: vi.fn() };
    aggregator.subscribeGlobal(globalHandler);

    aggregator.publishEvent(new EventA());
    aggregator.publishEvent(new EventB());

    expect(globalHandler.handleAsync).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe removes a handler so future publishes don't reach it", () => {
    const aggregator = new EventAggregator();
    const handler: IHandle<EventA> = { handle: vi.fn() };
    const unsubscribe = aggregator.subscribe(EventA, handler);

    aggregator.publishEvent(new EventA());
    expect(handler.handle).toHaveBeenCalledTimes(1);

    unsubscribe();
    aggregator.publishEvent(new EventA());
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });
});

describe("NullEventAggregator", () => {
  it("publishEvent is a no-op", () => {
    const aggregator = new NullEventAggregator();
    expect(() => aggregator.publishEvent(new EventA())).not.toThrow();
  });
});
