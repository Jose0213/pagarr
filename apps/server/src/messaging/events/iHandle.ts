import type { IEvent } from "./iEvent.js";

/**
 * Ported from NzbDrone.Core/Messaging/Events/IHandle.cs.
 *
 * C#: `IHandle<TEvent> : IProcessMessage<TEvent>` with a synchronous
 * `void Handle(TEvent message)`, and `IHandleAsync<TEvent> :
 * IProcessMessageAsync<TEvent>` with `void HandleAsync(TEvent message)`
 * (fire-and-forget on a background `Task`, not actually awaited by the
 * publisher -- see EventAggregator.cs's `_taskFactory.StartNew(...)
 * .LogExceptions()`). Ported as plain interfaces; the `TEvent extends
 * IEvent` constraint mirrors C#'s `where TEvent : IEvent`.
 *
 * `HandleAsync` here returns `void | Promise<void>` rather than requiring a
 * Promise: TS/JS has real async/await, so "fire-and-forget a background
 * task" naturally becomes "call it and don't await the returned promise"
 * (see EventAggregator.publishEvent below) -- a handler can be a plain sync
 * function or a real `async` one and both are supported the same way C#
 * allowed `HandleAsync` to be implemented either way (nothing in the C#
 * interface itself requires the implementation to actually be async).
 */
export interface IHandle<TEvent extends IEvent> {
  handle(message: TEvent): void;
}

export interface IHandleAsync<TEvent extends IEvent> {
  handleAsync(message: TEvent): void | Promise<void>;
}
