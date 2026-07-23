import type { IEvent } from "../messaging/index.js";

/**
 * Ported from NzbDrone.Core/Lifecycle/ApplicationStartingEvent.cs.
 *
 * A pure marker event (no payload) published very early in the C# app's
 * startup sequence (before the DB/most services are wired), e.g. by
 * `NzbDroneServiceFactory`. Nothing in this repo's scope yet performs that
 * bootstrap sequencing (there's no application-entrypoint module ported --
 * see this module's final report), so nothing here publishes it; it's
 * ported for shape fidelity so a future bootstrap module can `publishEvent
 * (new ApplicationStartingEvent())` and any `IHandle<ApplicationStartingEvent>`
 * subscriber (via the real `messaging/` module's `EventAggregator`) works
 * immediately.
 */
export class ApplicationStartingEvent implements IEvent {}
