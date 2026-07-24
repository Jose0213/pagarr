import { Router, type NextFunction, type Request, type Response } from "express";
import type { ValidationFailure } from "../../validation/validationResult.js";
import { ValidationException } from "../../validation/validationResult.js";
import type { RestResource } from "./RestResource.js";
import { stripDefaultId } from "./RestResource.js";
import { BadRequestException } from "./BadRequestException.js";
import { noopValidator, type ResourceValidator } from "./ResourceValidator.js";

/**
 * Ported from Readarr.Http/REST/RestController.cs.
 *
 * ## Why a factory function, not a base class
 *
 * C#'s `RestController<TResource> : Controller` is an ASP.NET MVC
 * inheritance-based base: concrete controllers (`AuthorController`,
 * `IndexerController`, etc.) subclass it, override `GetResourceById`,
 * decorate their action methods with routing attributes
 * (`[RestGetById]`/`[RestPostById]`/`[RestPutById]`/`[RestDeleteById]`), and
 * inherit `OnActionExecuting`'s validation pipeline for free via the MVC
 * action-filter mechanism. This port targets Express, which has no
 * attribute-routing or action-filter concept -- per this task's brief, the
 * faithful-port target is this class's real BEHAVIOR (the five REST verbs'
 * routes, the validation-on-POST/PUT-only rules, the id-validation-on-PUT/
 * DELETE rule, the route-id-onto-body mapping on PUT), not its C#-specific
 * inheritance mechanism. `restController()` is a factory that takes an
 * object of route handlers plus the same three validator slots
 * (`postValidator`/`putValidator`/`sharedValidator`, matching
 * `PostValidator`/`PutValidator`/`SharedValidator`) and returns a fully
 * wired Express `Router` reproducing `OnActionExecuting`'s exact validation
 * order and skip logic as factory options instead of attributes.
 *
 * ## Routes mounted (matches the four Attributes/*.cs route templates)
 *
 *   GET    /        -> options.getAll   (if provided)
 *   GET    /:id      -> options.getById  (RestGetByIdAttribute: "{id:int}", no id validation)
 *   POST   /        -> options.create   (RestPostByIdAttribute: no id template)
 *   PUT    /:id?     -> options.update   (RestPutByIdAttribute: "{id:int?}", optional in the route --
 *                       the real C# route allows PUT / too, relying on the body's own `Id`)
 *   DELETE /:id      -> options.delete   (RestDeleteByIdAttribute: "{id:int}", WITH id validation)
 *
 * Any handler left undefined is simply not mounted -- not every resource
 * supports every verb (e.g. a read-only resource has no create/update/delete).
 *
 * ## Validation pipeline (ported from OnActionExecuting, faithfully)
 *
 * For POST/PUT requests carrying a body that structurally matches
 * `TResource` (in C#, this filters `context.ActionArguments` by exact
 * runtime type match against `TResource`; this port's equivalent is simpler
 * since every mounted create/update handler's request body IS the resource
 * by construction -- there's no multi-parameter action method here to
 * filter across):
 *
 *   1. If PUT and the body's `id` is 0/unset and the route has an `:id`
 *      param, copy the route id onto the body (`resource.id = routeId`).
 *   2. Run `sharedValidator` unless `skipShared` is set for this route.
 *   3. If POST (and NOT skipValidate, and the request path does not end in
 *      "/test"): run `postValidator`.
 *      Else if PUT: run `putValidator`.
 *      (Note: skipValidate does NOT gate the PUT branch in the real C#
 *      source -- re-read RestController.cs's `ValidateResource`: the
 *      `!skipValidate` check is combined with the `Request.Method ==
 *      "POST"` condition via `&&`, and does not appear at all in the PUT
 *      `else if` branch. This looks asymmetric but is preserved exactly:
 *      `[SkipValidation]` alone silences POST's extra postValidator rules
 *      but never silences PUT's putValidator rules; only `skipShared`
 *      controls the shared validator for both verbs. Ported as-is per this
 *      task's "preserve validation order/skip logic faithfully" directive.)
 *   4. If any failures accumulated, throw `ValidationException` (this
 *      port's already-ported `validation/validationResult.ts` one, not a
 *      new type) with all of them.
 *
 * `skipValidate`/`skipShared` are per-route factory options
 * (`skipValidation`/`skipValidationShared` on a given route's handler
 * entry), the direct substitute for `[SkipValidation(skip, skipShared)]`.
 * The real attribute defaults both flags to `true` when merely present
 * (`[SkipValidation]` with no args means skip=true, skipShared=true); this
 * port's per-route option objects default both to `false` (i.e. "don't
 * skip anything") when omitted entirely, matching "no attribute present"
 * -- the same default C# has when a method carries no `[SkipValidation]` at
 * all (`skipAttribute` is null, so `skipValidate`/`skipShared` both read as
 * `false`).
 *
 * The `/test`-path POST exemption is ported as a literal suffix check
 * against the FULL request path (`requestPath()` below, using
 * `req.originalUrl` with the query string stripped -- NOT `req.path`,
 * which Express resets to `/` relative to wherever a router is mounted;
 * ASP.NET's `Request.Path` is always the full path from the app root, so
 * `req.originalUrl` minus its query string is the faithful equivalent)
 * ending in "/test" -- matches `Request.Path.ToString().EndsWith("/test",
 * ...)` case-insensitively.
 *
 * ## Id validation (ported from `ValidateId` + `VALIDATE_ID_ATTRIBUTES`)
 *
 * PUT and DELETE routes validate their `:id` route param is a positive
 * integer, throwing `BadRequestException` (this module's own
 * `Readarr.Http.REST.BadRequestException`, HTTP 400) if `id <= 0` --
 * ported from `VALIDATE_ID_ATTRIBUTES = [RestPutByIdAttribute,
 * RestDeleteByIdAttribute]`. GET-by-id does NOT validate its id this way
 * (`RestGetByIdAttribute` is absent from that list) -- an invalid/missing
 * GET id simply flows to the handler, matching the real C# controller's
 * `GetResourceByIdWithErrorHandler` (only catches `ModelNotFoundException`
 * -> 404, never validates the id shape itself).
 *
 * ## `Created`/`Accepted` helpers
 *
 * C#'s `Created(id)`/`Accepted(id)` re-fetch the resource via
 * `GetResourceById` and wrap it in a 201/202 `ActionResult`. This port
 * exposes `sendCreated`/`sendAccepted` helpers a `create`/`update` handler
 * calls at the end of its own logic (handlers own their full response, per
 * Express convention -- there's no controller-method-return-value
 * convention to hook into here the way C#'s `ActionResult<T>` return type
 * provided).
 */

export interface RestControllerOptions<TResource extends RestResource> {
  /** Ported from the real controller's own `[HttpGet] GetAll()` override (not on the C# base itself, but present on every concrete resource controller -- included here since it's universal enough to belong in the shared factory). */
  getAll?: (req: Request) => TResource[] | Promise<TResource[]>;
  /** Ported from RestController.GetResourceById (abstract in C#, called both directly for GET-by-id and internally by Created/Accepted). Throwing `ModelNotFoundException` -> 404, matching `GetResourceByIdWithErrorHandler`'s catch. */
  getById?: (id: number, req: Request) => TResource | Promise<TResource>;
  create?: (
    resource: TResource,
    req: Request,
    res: Response
  ) => TResource | Promise<TResource> | void | Promise<void>;
  update?: (
    resource: TResource,
    req: Request,
    res: Response
  ) => TResource | Promise<TResource> | void | Promise<void>;
  delete?: (id: number, req: Request, res: Response) => void | Promise<void>;

  /** Ported from RestController's `PostValidator` property. Defaults to a no-op validator, matching a fresh `new ResourceValidator<TResource>()` with no rules added. */
  postValidator?: ResourceValidator<TResource>;
  /** Ported from RestController's `PutValidator` property, WITHOUT the ctor's `PutValidator.RuleFor(r => r.Id).ValidId()` rule -- that rule is redundant with this factory's own id-validation-on-PUT step (see module doc comment) and is applied structurally here rather than duplicated into the validator slot. */
  putValidator?: ResourceValidator<TResource>;
  /** Ported from RestController's `SharedValidator` property. */
  sharedValidator?: ResourceValidator<TResource>;
}

/** Per-route validation-skip override -- the factory-option substitute for `[SkipValidation(skip, skipShared)]`. See module doc comment. */
export interface SkipValidationOptions {
  /** Ported from SkipValidationAttribute.Skip. */
  skipValidation?: boolean;
  /** Ported from SkipValidationAttribute.SkipShared. */
  skipValidationShared?: boolean;
}

/**
 * Ported from RestController.ValidateId: throws BadRequestException if
 * `id <= 0`. Exported standalone (not just used internally) so
 * ProviderControllerBase and future custom-route controllers can apply the
 * exact same id check to routes this factory doesn't itself mount (e.g.
 * ProviderControllerBase's `PUT /bulk`/`DELETE /bulk` operate on a list of
 * ids, each individually not subject to this, but a hypothetical
 * `POST /:id/action` route would want it).
 */
export function validateId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException(`${id} is not a valid ID`);
  }
}

/**
 * Ported from RestController.ValidateResource. Exported standalone for the
 * same reason as `validateId` -- ProviderControllerBase's `test`/`action`
 * custom routes run this same validation logic outside the five base
 * routes' auto-wired middleware.
 */
export function validateResource<TResource extends RestResource>(
  resource: TResource | null | undefined,
  method: "POST" | "PUT",
  requestPath: string,
  validators: Required<
    Pick<RestControllerOptions<TResource>, "postValidator" | "putValidator" | "sharedValidator">
  >,
  options: SkipValidationOptions = {}
): void {
  if (resource === null || resource === undefined) {
    throw new BadRequestException("Request body can't be empty");
  }

  const skipValidate = options.skipValidation ?? false;
  const skipSharedValidate = options.skipValidationShared ?? false;

  const errors: ValidationFailure[] = [];

  if (!skipSharedValidate) {
    errors.push(...validators.sharedValidator(resource));
  }

  if (method === "POST" && !skipValidate && !requestPath.toLowerCase().endsWith("/test")) {
    errors.push(...validators.postValidator(resource));
  } else if (method === "PUT") {
    errors.push(...validators.putValidator(resource));
  }

  if (errors.length > 0) {
    throw new ValidationException(errors);
  }
}

/** Wraps an async Express handler so a rejected promise reaches the error-handling middleware instead of becoming an unhandled rejection. Express 4 (this port's target -- see package.json) has no built-in async-handler support; Express 5 added it, but pinning to 4 for this port per the task's dependency choice. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Parses and validates an `:id` route param as a positive integer, matching the real C# route templates' `{id:int}` constraint (a non-integer id 404s at the routing layer in ASP.NET; here it flows through as `NaN` and is rejected by `validateId`/left to the handler depending on the route, matching this file's per-route id-validation rules documented above). */
function routeId(req: Request): number {
  return Number.parseInt(req.params["id"] ?? "", 10);
}

/**
 * The full request path from the app root, query string stripped --
 * `req.originalUrl` (NOT `req.path`, which Express resets to be relative to
 * wherever the current router is mounted; see this file's module doc
 * comment for why that distinction matters for the `/test`-path POST
 * exemption). Matches ASP.NET's `Request.Path.ToString()`.
 */
export function requestPath(req: Request): string {
  const queryIndex = req.originalUrl.indexOf("?");
  return queryIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, queryIndex);
}

export function restController<TResource extends RestResource>(
  options: RestControllerOptions<TResource>
): Router {
  const router = Router();

  const validators = {
    postValidator: options.postValidator ?? noopValidator<TResource>(),
    putValidator: options.putValidator ?? noopValidator<TResource>(),
    sharedValidator: options.sharedValidator ?? noopValidator<TResource>(),
  };

  if (options.getAll) {
    const { getAll } = options;
    router.get(
      "/",
      asyncHandler(async (req, res) => {
        const resources = await getAll(req);
        res.json(resources.map(stripDefaultId));
      })
    );
  }

  if (options.getById) {
    const { getById } = options;
    router.get(
      "/:id",
      asyncHandler(async (req, res) => {
        const resource = await getById(routeId(req), req);
        res.json(stripDefaultId(resource));
      })
    );
  }

  if (options.create) {
    const { create } = options;
    router.post(
      "/",
      asyncHandler(async (req, res) => {
        const resource = req.body as TResource;
        validateResource(resource, "POST", requestPath(req), validators);

        const result = await create(resource, req, res);
        if (result !== undefined && !res.headersSent) {
          res.status(201).json(stripDefaultId(result));
        }
      })
    );
  }

  if (options.update) {
    const { update } = options;
    router.put(
      "/:id?",
      asyncHandler(async (req, res) => {
        const resource = req.body as TResource;

        // Ported: "Map route Id to body resource if not set in request."
        if (resource && !resource.id && req.params["id"] !== undefined) {
          resource.id = Number.parseInt(req.params["id"], 10);
        }

        validateResource(resource, "PUT", requestPath(req), validators);

        if (req.params["id"] !== undefined) {
          validateId(routeId(req));
        }

        const result = await update(resource, req, res);
        if (result !== undefined && !res.headersSent) {
          res.status(202).json(stripDefaultId(result));
        }
      })
    );
  }

  if (options.delete) {
    const { delete: deleteHandler } = options;
    router.delete(
      "/:id",
      asyncHandler(async (req, res) => {
        const id = routeId(req);
        validateId(id);

        await deleteHandler(id, req, res);
        if (!res.headersSent) {
          res.json({});
        }
      })
    );
  }

  return router;
}
