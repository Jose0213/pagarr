import { Router } from "express";
import type { Request } from "express";
import { ModelAction } from "../../../db/events.js";
import type { EventAggregator } from "../../../messaging/events/eventAggregator.js";
import { CommandExecutedEvent } from "../../../messaging/events/commandExecutedEvent.js";
import type { IQualityDefinitionService } from "../../../qualities/qualityDefinitionService.js";
import type { QualityDefinition } from "../../../qualities/qualityDefinition.js";
import { restControllerWithSignalR } from "../../rest/RestControllerWithSignalR.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import type { SignalRBroadcaster } from "../../signalr/SignalRBroadcaster.js";
import {
  QUALITY_DEFINITION_RESOURCE_NAME,
  qualityDefinitionResourcesToModels,
  qualityDefinitionToModel,
  qualityDefinitionToResource,
  qualityDefinitionsToResources,
  type QualityDefinitionResource,
} from "./QualityDefinitionResource.js";

/**
 * Ported from Readarr.Api.V1/Qualities/QualityDefinitionController.cs.
 *
 * `QualityDefinitionController : RestControllerWithSignalR<
 * QualityDefinitionResource, QualityDefinition>, IHandle<CommandExecutedEvent>`
 * -- built on `restControllerWithSignalR()` (rest/RestControllerWithSignalR.ts)
 * for the base CRUD + SignalR-broadcast wiring, plus:
 *
 *   - No `create`/`delete` (the real C# controller declares no
 *     `[RestPostById]`/`[RestDeleteById]` action methods -- quality
 *     definitions are a fixed set seeded by `QualityDefinitionService.
 *     handleApplicationStarted()`, never created/deleted through the API).
 *   - `PUT /update` (`[HttpPut("update")]`, `UpdateMany`): a custom bulk
 *     route mounted alongside the five base REST routes, exactly like
 *     `ProviderControllerBase`'s extra `/bulk`/`/schema`/`/test` routes
 *     (see ProviderControllerBase.ts's module doc comment for the same
 *     "extra routes layered on top of restController()'s router" pattern).
 *     Returns 202 with the FULL refreshed list (`_qualityDefinitionService.
 *     All().ToResource()`), not just the updated subset -- ported exactly.
 *   - `IHandle<CommandExecutedEvent>`: broadcasts a resourceless `Sync`
 *     SignalR change whenever a `ResetQualityDefinitions` command finishes
 *     (matches `Handle(CommandExecutedEvent message)`'s `if (message.Command.
 *     Name == "ResetQualityDefinitions") { BroadcastResourceChange(ModelAction.
 *     Sync); }` -- name-string match, ported literally, not by a stronger
 *     typed reference, since that's exactly what the C# source does).
 */

export interface QualityDefinitionControllerOptions {
  qualityDefinitionService: IQualityDefinitionService;
  eventAggregator: EventAggregator;
  signalRBroadcaster: SignalRBroadcaster;
}

export function qualityDefinitionController(options: QualityDefinitionControllerOptions): {
  router: Router;
  unsubscribe: () => void;
} {
  const { qualityDefinitionService, eventAggregator, signalRBroadcaster } = options;

  function getResourceById(id: number): QualityDefinitionResource {
    return qualityDefinitionToResource(qualityDefinitionService.getById(id));
  }

  const { router: baseRouter, unsubscribe: unsubscribeSignalR } = restControllerWithSignalR<
    QualityDefinitionResource,
    QualityDefinition
  >({
    resourceName: QUALITY_DEFINITION_RESOURCE_NAME,
    eventAggregator,
    signalRBroadcaster,
    getResourceByIdForBroadcast: getResourceById,

    getAll: () => qualityDefinitionsToResources(qualityDefinitionService.all()),
    getById: (id: number) => getResourceById(id),

    update: (resource: QualityDefinitionResource) => {
      const model = qualityDefinitionToModel(resource);
      qualityDefinitionService.update(model);
      return getResourceById(model.id);
    },
  });

  // Ported from [HttpPut("update")] UpdateMany([FromBody] List<QualityDefinitionResource>).
  //
  // MOUNT ORDER: this literal "/update" route MUST be registered before
  // baseRouter's own "PUT /:id?" (restController()'s base update route,
  // whose id param is OPTIONAL -- see RestController.ts) is reached, or
  // Express would match "PUT /update" against "/:id?" first (treating the
  // literal string "update" as an attempted `:id` value, which then 400s
  // via validateId's NaN check) and this route would never run. ASP.NET's
  // real attribute routing always prefers a more-specific literal template
  // ([HttpPut("update")]) over a parameterized one ({id:int?}) regardless of
  // declaration order; Express has no such specificity-based dispatch, only
  // registration order, so this port reproduces the same effective
  // precedence by registering the literal route on its own top-level router
  // FIRST, then mounting baseRouter's five REST routes as middleware after
  // it (see below).
  const router = Router();

  router.put("/update", (req: Request, res, next) => {
    try {
      const resources = req.body as QualityDefinitionResource[];
      const qualityDefinitions = qualityDefinitionResourcesToModels(resources);

      qualityDefinitionService.updateMany(qualityDefinitions);

      const all = qualityDefinitionsToResources(qualityDefinitionService.all());
      res.status(202).json(all.map(stripDefaultId));
    } catch (err) {
      next(err);
    }
  });

  router.use(baseRouter);

  // ---- IHandle<CommandExecutedEvent> -------------------------------------
  // Ported from Handle(CommandExecutedEvent message): broadcast a
  // resourceless Sync change whenever "ResetQualityDefinitions" finishes.
  const unsubscribeCommandHandler = eventAggregator.subscribe(CommandExecutedEvent, {
    handle: (message: CommandExecutedEvent) => {
      if (message.command.name === "ResetQualityDefinitions") {
        if (!signalRBroadcaster.isConnected) {
          return;
        }
        signalRBroadcaster.broadcastResourceChange(
          ModelAction.Sync,
          QUALITY_DEFINITION_RESOURCE_NAME
        );
      }
    },
  });

  return {
    router,
    unsubscribe: () => {
      unsubscribeSignalR();
      unsubscribeCommandHandler();
    },
  };
}
