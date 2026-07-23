import type { IEvent } from "../messaging/index.js";

/**
 * Ported from NzbDrone.Core/Lifecycle/ApplicationStartedEvent.cs.
 *
 * A pure marker event (no payload) published once the C# app has finished
 * starting up. Real subscribers already exist in this port -- e.g.
 * `config/configFileProvider.ts`'s `handleApplicationStarted()` and
 * `messaging/commands/commandQueueManager.ts`'s `handleApplicationStarted()`
 * -- but both were ported *before* this module (Lifecycle) existed, so they
 * expose plain methods a caller invokes directly rather than real
 * `IHandle<ApplicationStartedEvent>` subscriptions (see each file's own doc
 * comment for why). This class exists so a future application-wiring
 * module can do the real thing: `eventAggregator.subscribe(
 * ApplicationStartedEvent, { handle: () => configFileProvider.
 * handleApplicationStarted() })` etc., and `publishEvent(new
 * ApplicationStartedEvent())` once at startup to fan out to all of them --
 * reconciling those two plain-method call sites into real subscriptions is
 * cross-module wiring work for that future module, not done here (this
 * worktree only owns `media-cover/` and `lifecycle/`, per PORT_PLAN.md's
 * per-worktree scope).
 */
export class ApplicationStartedEvent implements IEvent {}
