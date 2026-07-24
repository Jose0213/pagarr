import type { Router } from "express";
import { ModelAction } from "../../../db/events.js";
import type { EventAggregator } from "../../../messaging/events/eventAggregator.js";
import type { SignalRBroadcaster } from "../../signalr/SignalRBroadcaster.js";
import { restControllerWithSignalR } from "../../rest/RestControllerWithSignalR.js";
import type { IHealthCheckService } from "../../../health-check/healthCheckService.js";
import type { HealthCheck } from "../../../health-check/healthCheck.js";
import { HEALTH_RESOURCE_NAME, healthChecksToResource } from "./HealthResource.js";
import type { HealthResource } from "./HealthResource.js";

/**
 * Ported from Readarr.Api.V1/Health/HealthController.cs.
 *
 * `GetResourceById(int id)` is `throw new NotImplementedException();` in the
 * real C# source -- `HealthCheck` results have no real per-id persistence
 * or lookup (they live only in `HealthCheckService`'s in-memory results
 * map, keyed by source name, not id -- see healthCheckService.ts's
 * `healthCheckResults: Map<string, HealthCheck>`), and the controller never
 * actually needs a GET-by-id route (there's no "fetch one health check by
 * id" UI affordance; the real `[NonAction] GetResourceByIdWithErrorHandler`
 * override even exists purely to suppress ASP.NET's own attempt to
 * auto-wire a GET/:id route from the base class). Ported faithfully:
 * `getById` below throws the same way, rather than omitting the option
 * entirely (which would 404 instead of 500 -- a real, if minor, behavioral
 * difference; throwing preserves "this route exists and is broken exactly
 * the way the real one is broken" instead of "this route doesn't exist").
 *
 * `IHandle<HealthCheckCompleteEvent>` (`Handle` -> resourceless "Sync"
 * broadcast) is exposed here as `broadcastHealthSync`, the same
 * caller-wires-it-as-a-callback pattern this task's other
 * `RestControllerWithSignalR`-based controllers use for their own
 * `IHandle<T>` methods (see TagController.ts's `broadcastTagsSync`) --
 * `HealthCheckCompleteEvent` itself is a real, already-ported marker event
 * (health-check/healthCheckCompleteEvent.ts) published by
 * `HealthCheckService.performHealthCheck` on every run, so a caller wiring
 * this controller into the app can `eventAggregator.subscribe(HealthCheckCompleteEvent,
 * { handle: () => broadcastHealthSync(signalRBroadcaster) })` to reproduce
 * the real subscription exactly.
 */
export interface HealthControllerOptions {
  healthCheckService: IHealthCheckService;
  eventAggregator: EventAggregator;
  signalRBroadcaster: SignalRBroadcaster;
}

export function healthController(options: HealthControllerOptions): Router {
  const { healthCheckService, eventAggregator, signalRBroadcaster } = options;

  const { router } = restControllerWithSignalR<HealthResource, HealthCheck>({
    resourceName: HEALTH_RESOURCE_NAME,
    eventAggregator,
    signalRBroadcaster,

    // Ported from `GetResourceById(int id) => throw new NotImplementedException();` -- see module doc comment.
    getById: () => {
      throw new Error("Not implemented");
    },

    // Ported from `GetHealth()`: `_healthCheckService.Results().ToResource()`.
    getAll: () => healthChecksToResource(healthCheckService.results()),
  });

  return router;
}

/** Ported from `HealthController.Handle(HealthCheckCompleteEvent message)`. See module doc comment. */
export function broadcastHealthSync(signalRBroadcaster: SignalRBroadcaster): void {
  signalRBroadcaster.broadcastResourceChange(ModelAction.Sync, HEALTH_RESOURCE_NAME);
}
