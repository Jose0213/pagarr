import { Router, type Request, type Response, type NextFunction } from "express";
import type { ITaskManager } from "../../../jobs/TaskManager.js";
import type { ScheduledTask } from "../../../jobs/ScheduledTask.js";
import { NotFoundException } from "../../rest/NotFoundException.js";
import { stripDefaultId, type RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/System/Tasks/{TaskResource,TaskController}.cs.
 * Mount path (per `[V1ApiController("system/task")]`): `/api/v1/system/task`.
 *
 * `TaskController : RestControllerWithSignalR<TaskResource, ScheduledTask>,
 * IHandle<CommandExecutedEvent>` -- ported directly against the REAL,
 * already-merged `rest/RestControllerWithSignalR.ts` factory (not a
 * forward-ref) for the SignalR-broadcast wiring, and the real `jobs/
 * TaskManager.ts`'s `ITaskManager` for data. `IHandle<CommandExecutedEvent>`
 * (`Handle` -> `BroadcastResourceChange(ModelAction.Sync)` whenever any
 * command finishes executing anywhere in the app) is exposed as
 * `onCommandExecuted()`, a plain method a caller's messaging-wiring step
 * invokes on the real `EventAggregator`'s `CommandExecutedEvent` subscription
 * -- the same "define the seam, wire the real bus later" convention this
 * whole port uses for event-driven C# handlers (see e.g. `jobs/
 * TaskManager.ts`'s own `onCommandExecuted`/`onConfigSaved` methods, which
 * this module's name intentionally echoes).
 *
 * Read-only resource: no create/update/delete routes exist on the real
 * controller (`ITaskManager` has no mutation methods either).
 */
export interface TaskResource extends RestResource {
  name: string;
  taskName: string;
  interval: number;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  lastExecution: string;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  lastStartTime: string;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  nextExecution: string;
}

/** Ported from `StringExtensions.SplitCamelCase`: `(?<!^)[A-Z]` -- insert a space before every uppercase letter that isn't the first character. */
function splitCamelCase(input: string): string {
  return input.replace(/(?!^)[A-Z]/g, (match) => ` ${match}`);
}

/** Ported from TaskController's private `ConvertToResource(ScheduledTask)`. */
export function taskToResource(scheduledTask: ScheduledTask): TaskResource {
  const lastTypeNameSegment = scheduledTask.typeName.split(".").at(-1) ?? scheduledTask.typeName;
  const taskName = lastTypeNameSegment.replace(/Command$/, "");

  const nextExecution = new Date(
    new Date(scheduledTask.lastExecution).getTime() + scheduledTask.interval * 60 * 1000
  ).toISOString();

  return {
    id: scheduledTask.id,
    name: splitCamelCase(taskName),
    taskName,
    interval: scheduledTask.interval,
    lastExecution: scheduledTask.lastExecution,
    lastStartTime: scheduledTask.lastStartTime,
    nextExecution,
  };
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function taskController(taskManager: ITaskManager): Router {
  const router = Router();

  // Ported from `GetAll()`: `.OrderBy(t => t.Name)` -- note this sorts by
  // the ALREADY-`SplitCamelCase`d display Name, not TaskName/TypeName.
  router.get(
    "/",
    asyncHandler((_req, res) => {
      const resources = taskManager
        .getAll()
        .map(taskToResource)
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json(resources.map(stripDefaultId));
    })
  );

  // Ported from `protected override TaskResource GetResourceById(int id)`:
  // returns null (-> 404 via the real RestController machinery) when no
  // match -- this port throws NotFoundException directly, matching
  // rest/RestController.ts's own GET-by-id contract (see that file's doc
  // comment: "Throwing ModelNotFoundException -> 404").
  router.get(
    "/:id",
    asyncHandler((req, res) => {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      const task = taskManager.getAll().find((t) => t.id === id);

      if (!task) {
        throw new NotFoundException();
      }

      res.json(stripDefaultId(taskToResource(task)));
    })
  );

  return router;
}
