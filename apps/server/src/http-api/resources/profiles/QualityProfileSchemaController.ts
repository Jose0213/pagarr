import { Router } from "express";
import type { QualityProfileService } from "../../../profiles/qualities/qualityProfileService.js";
import { stripDefaultId } from "../../rest/RestResource.js";
import { qualityProfileToResource } from "./QualityProfileResource.js";

/**
 * Ported from Readarr.Api.V1/Profiles/Quality/QualityProfileSchemaController.cs.
 *
 * `[V1ApiController("qualityprofile/schema")]` -- standalone `Controller`
 * mounted at its own sibling path, same pattern as
 * MetadataProfileSchemaController.ts (see that file's doc comment for why
 * this is a separate router, not a nested "/schema" route under
 * QualityProfileController's own router).
 *
 * `GetSchema()`: `_qualityProfileService.GetDefaultProfile(string.Empty)`
 * -- an empty name, no cutoff override, no allowed qualities (every quality
 * defaults to `Allowed: false`, matching `GetDefaultProfile`'s `allowed`
 * params array being empty here).
 *
 * MOUNT ORDER (IMPORTANT for callers): same requirement as
 * MetadataProfileSchemaController.ts -- mount this router at
 * `/api/v1/qualityprofile/schema` BEFORE `qualityProfileController()` is
 * mounted at `/api/v1/qualityprofile`, or the base controller's `GET /:id`
 * route intercepts the request first. See that file's doc comment for the
 * full explanation.
 */
export interface QualityProfileSchemaControllerOptions {
  qualityProfileService: QualityProfileService;
}

export function qualityProfileSchemaController(
  options: QualityProfileSchemaControllerOptions
): Router {
  const { qualityProfileService } = options;
  const router = Router();

  router.get("/", (_req, res) => {
    const profile = qualityProfileService.getDefaultProfile("");
    // stripDefaultId applied explicitly -- see MetadataProfileSchemaController.ts's
    // doc comment for why a plain (non-restController) router needs this.
    res.json(stripDefaultId(qualityProfileToResource(profile)));
  });

  return router;
}
