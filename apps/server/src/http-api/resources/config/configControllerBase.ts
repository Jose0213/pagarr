import { Router, type Request, type Response, type NextFunction } from "express";
import type { IConfigService } from "../../../config/configService.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import { requestPath, validateId, validateResource } from "../../rest/RestController.js";
import { stripDefaultId, type RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/Config/ConfigController.cs.
 *
 * C#'s `ConfigController<TResource> : RestController<TResource>` is an
 * abstract MVC base every simple "one config resource, backed entirely by
 * IConfigService, id always 1" controller (DownloadClientConfigController,
 * IndexerConfigController, MediaManagementConfigController,
 * MetadataProviderConfigController, UiConfigController) subclasses,
 * overriding just `ToResource(IConfigService)` (the model->resource mapper)
 * and inheriting `GetConfig`/`SaveConfig`/`GetResourceById` for free.
 *
 * ## Why this does NOT delegate to `restController()`
 *
 * `RestController<TResource>`'s inherited `[HttpGet]` route (`GetAll` in the
 * generic base, per rest/RestController.ts's own doc comment) always
 * returns an ARRAY at `GET /` (`res.json(resources.map(stripDefaultId))`).
 * `ConfigController<TResource>.GetConfig()` overrides that same `[HttpGet]`
 * slot with its OWN method returning a single `TResource` object directly
 * (verified against the real route attributes: `V1ApiControllerAttribute`
 * maps the controller's class-level route to e.g. `api/v1/config/
 * downloadclient`, and `[HttpGet]` with no template binds `GetConfig` to
 * exactly that base path -- there is no separate list endpoint, no
 * `[]`-wrapping). `restController()`'s `getAll` option cannot reproduce
 * this (it's hard-coded to serialize an array), so this factory builds its
 * own tiny Express `Router` directly instead of composing `restController()`
 * -- the two other real routes it needs (`GET /:id` via `GetResourceById`,
 * `PUT /:id?` via `SaveConfig`, both of which `ConfigController` inherits
 * UNCHANGED from `RestController<TResource>`) reuse this module's exported
 * `validateResource`/`validateId`/`stripDefaultId` helpers directly so the
 * validation pipeline (shared/put validators, id-onto-body mapping,
 * id-validation-on-PUT) stays byte-for-byte identical to what
 * `restController()` itself runs -- see rest/RestController.ts's doc
 * comment for the full validation-order writeup this mirrors.
 *
 * ## What's ported
 *
 *   - `GET /`      -> `GetConfig()`: `{ ...toResource(configService), id: 1 }`.
 *   - `GET /:id`   -> `GetResourceById(id)`: same singleton, id argument
 *     ignored (ported literally -- `protected override TResource
 *     GetResourceById(int id) { return GetConfig(); }`).
 *   - `PUT /:id?`  -> `SaveConfig(resource)`: ported from reflecting every
 *     public property off the submitted resource into a plain dictionary
 *     and calling `_configService.SaveConfigDictionary(dictionary)`, then
 *     `Accepted(resource.Id)` (re-fetches via `GetResourceById`). This port
 *     has no property reflection, so `toDictionary(resource)` is an
 *     explicit caller-supplied mapper -- the same "explicit over
 *     reflection" substitute used throughout this codebase (see
 *     client-schema/SchemaBuilder.ts's doc comment for the canonical
 *     statement of the pattern).
 *
 * No POST/DELETE -- ported from the real controller's route set: a config
 * singleton has neither (`ConfigController` itself only defines
 * `GetConfig`/`SaveConfig`; none of the five real subclasses this task
 * ports adds create/delete).
 */
export interface ConfigControllerOptions<TResource extends RestResource> {
  configService: IConfigService;
  toResource: (configService: IConfigService) => Omit<TResource, "id">;
  /** Explicit substitute for C#'s `resource.GetType().GetProperties(...).ToDictionary(...)` reflection -- see module doc comment. */
  toDictionary: (resource: TResource) => Record<string, unknown>;
  sharedValidator?: ResourceValidator<TResource>;
  putValidator?: ResourceValidator<TResource>;
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function configController<TResource extends RestResource>(
  options: ConfigControllerOptions<TResource>
): Router {
  const { configService, toResource, toDictionary, sharedValidator, putValidator } = options;
  const router = Router();

  const validators = {
    sharedValidator: sharedValidator ?? (() => []),
    putValidator: putValidator ?? (() => []),
    postValidator: () => [],
  };

  function getConfig(): TResource {
    return { ...toResource(configService), id: 1 } as TResource;
  }

  router.get(
    "/",
    asyncHandler((_req, res) => {
      res.json(stripDefaultId(getConfig()));
    })
  );

  router.get(
    "/:id",
    asyncHandler((_req, res) => {
      res.json(stripDefaultId(getConfig()));
    })
  );

  router.put(
    "/:id?",
    asyncHandler((req, res) => {
      const resource = req.body as TResource;

      // Ported: "Map route Id to body resource if not set in request." (same rule restController() applies -- see its doc comment).
      if (resource && !resource.id && req.params["id"] !== undefined) {
        resource.id = Number.parseInt(req.params["id"], 10);
      }

      validateResource(resource, "PUT", requestPath(req), validators);

      if (req.params["id"] !== undefined) {
        validateId(Number.parseInt(req.params["id"] ?? "", 10));
      }

      configService.saveConfigDictionary(toDictionary(resource));

      res.status(202).json(stripDefaultId(getConfig()));
    })
  );

  return router;
}
