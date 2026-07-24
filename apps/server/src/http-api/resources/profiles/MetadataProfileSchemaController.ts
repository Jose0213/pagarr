import { Router } from "express";
import { newMetadataProfile } from "../../../profiles/metadata/metadataProfile.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import { metadataProfileToResource } from "./MetadataProfileResource.js";

/**
 * Ported from Readarr.Api.V1/Profiles/Metadata/MetadataProfileSchemaController.cs.
 *
 * `[V1ApiController("metadataprofile/schema")]` -- a standalone `Controller`
 * (NOT `RestController<TResource>`), mounted at its own sibling path rather
 * than as a sub-route of `MetadataProfileController`'s router (matches the
 * real C# routing: `metadataprofile/schema` and `metadataprofile` are two
 * separate controllers with two separate route prefixes, not one prefix
 * with a nested "/schema" route). This port mirrors that: a tiny router
 * exposing a single `GET /` a caller mounts at `/api/v1/metadataprofile/schema`
 * (its own base path), not nested under the main controller's router.
 *
 * `GetAll()`'s naming in the C# source is misleading (it returns ONE
 * resource, not a list) -- ported faithfully as a single-object response,
 * matching the real wire shape, not the misleading method name.
 *
 * `stripDefaultId()` is applied explicitly here (this router is a plain
 * `Controller`, not built on `restController()`, which is what normally
 * applies it automatically) -- matches the base `RestResource.Id`'s real
 * `[JsonIgnore(Condition = WhenWritingDefault)]` behavior: a fresh template
 * profile's `id` is 0 and must be omitted from the response, not serialized
 * as `"id": 0`.
 *
 * MOUNT ORDER (IMPORTANT for callers): this router MUST be mounted at
 * `/api/v1/metadataprofile/schema` BEFORE `metadataProfileController()` is
 * mounted at `/api/v1/metadataprofile` on the same Express app. If mounted
 * after, `GET /api/v1/metadataprofile/schema` would be matched by the base
 * controller's `GET /:id` route first (`restController()`'s route,
 * `:id = "schema"`), which fails rather than reaching this router at all --
 * Express has no ASP.NET-style "prefer the more specific literal route"
 * dispatch; only registration order determines the winner between two
 * routers whose paths overlap like this. See ProviderControllerBase.ts's
 * own `/schema` route for the same "mount schema before the id-catching
 * base route" requirement, there solved within a single router instead of
 * two sibling ones.
 */
export function metadataProfileSchemaController(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const profile = newMetadataProfile({ allowedLanguages: "eng" });
    res.json(stripDefaultId(metadataProfileToResource(profile)));
  });

  return router;
}
