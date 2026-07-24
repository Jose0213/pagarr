import { Router } from "express";
import { allLanguageResources, languageResourceById } from "./LanguageResource.js";

/**
 * Ported from Readarr.Api.V1/Languages/LanguageController.cs.
 *
 * `LanguageController : RestController<LanguageResource>` mounts only the
 * base class's `GET /` and `GET /:id` routes (no `[RestPostById]`/
 * `[RestPutById]`/`[RestDeleteById]` action methods are declared -- Language
 * is a fixed, read-only enum-backed resource, never created/updated/deleted
 * through the API). This port therefore does NOT use `restController()`
 * (rest/RestController.ts): that factory's `getAll`/`getById` options both
 * unconditionally apply `stripDefaultId()` to every response, which would
 * incorrectly omit `id: 0` (the "Unknown" language) -- see
 * LanguageResource.ts's doc comment for why this resource's `Id` is
 * `[JsonIgnore(Condition = Never)]`, the opposite of the base
 * `RestResource.Id`'s default. A hand-built two-route router reproduces the
 * exact same GET-only surface without that automatic stripping.
 *
 * ## GET /:id error handling
 *
 * C#'s `GetResourceById` throws .NET's `ArgumentException` (via
 * `languageFromId`'s port of `Language.FindById`/the explicit `(Language)id`
 * cast) for an id matching no known language. `RestController`'s real
 * `GetResourceByIdWithErrorHandler` wrapper (ported behavior, see
 * rest/RestController.ts's module doc comment) only catches
 * `ModelNotFoundException` specially -> 404; every other exception type
 * (including this `ArgumentException`) falls through to the generic
 * unhandled-exception path, which the real ASP.NET pipeline turns into a
 * 500. This port matches that: `languageResourceById`'s thrown `RangeError`
 * (see language.ts) is NOT caught/translated here and is left to propagate
 * to `readarrErrorPipeline`'s generic handler, which is exactly what a
 * non-`NotFoundException` error type produces -- a 500, not a 404.
 */
export function languageController(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(allLanguageResources());
  });

  router.get("/:id", (req, res, next) => {
    try {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      res.json(languageResourceById(id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
