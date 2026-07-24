import type { ConfigFileProvider } from "../../../config/configFileProvider.js";
import type { IConfigService } from "../../../config/configService.js";
import { isValidUrl } from "../../../validation/ruleHelpers.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import { requestPath, validateId, validateResource } from "../../rest/RestController.js";
import { stripDefaultId, type RestResource } from "../../rest/RestResource.js";
import { Router, type Request, type Response, type NextFunction } from "express";

/**
 * Ported from Readarr.Api.V1/Config/{DevelopmentConfigResource,
 * DevelopmentConfigController}.cs. Mount path: `/api/v1/config/development`.
 *
 * NOTE: the real `DevelopmentConfigController` is declared `RestController
 * <DevelopmentConfigResource>` directly (not `ConfigController<TResource>`),
 * but its `GetDevelopmentConfig`/`SaveDevelopmentConfig` method bodies are
 * structurally identical to `ConfigController<T>`'s inherited
 * `GetConfig`/`SaveConfig` (singleton resource, id forced to 1, dictionary
 * built from every public property) -- EXCEPT it persists to BOTH
 * `IConfigFileProvider` AND `IConfigService` (like UiConfigResource.ts's
 * `uiConfigController`, which has the same two-store save and is built the
 * same direct-Express-router way for the same reason: `configControllerBase
 * .ts`'s `configController()` factory only knows about a single
 * `IConfigService`).
 */
export interface DevelopmentConfigResource extends RestResource {
  metadataSource: string;
  consoleLogLevel: string;
  logSql: boolean;
  logRotate: number;
  filterSentryEvents: boolean;
}

/** Ported from DevelopmentConfigResourceMapper.ToResource(IConfigFileProvider, IConfigService). */
export function toDevelopmentConfigResource(
  configFileProvider: ConfigFileProvider,
  configService: IConfigService
): Omit<DevelopmentConfigResource, "id"> {
  return {
    metadataSource: configService.metadataSource,
    consoleLogLevel: configFileProvider.consoleLogLevel,
    logSql: configFileProvider.logSql,
    logRotate: configFileProvider.logRotate,
    filterSentryEvents: configFileProvider.filterSentryEvents,
  };
}

/** camelCase keys matching `IConfigService`/`ConfigFileProvider`'s own property names -- see DownloadClientConfigResource.ts's doc comment for why this differs from the real C# reflection's PascalCase. `metadataSource` lands on `ConfigService`; the rest land on `ConfigFileProvider` -- each store ignores keys it doesn't own, matching the real dual-save behavior. */
function toDictionary(resource: DevelopmentConfigResource): Record<string, unknown> {
  return {
    metadataSource: resource.metadataSource,
    consoleLogLevel: resource.consoleLogLevel,
    logSql: resource.logSql,
    logRotate: resource.logRotate,
    filterSentryEvents: resource.filterSentryEvents,
  };
}

/** Ported from DevelopmentConfigController's ctor: `MetadataSource` must be a valid URL when not blank. */
export function developmentConfigSharedValidator(
  resource: DevelopmentConfigResource
): ValidationFailure[] {
  if (resource.metadataSource.trim() !== "" && !isValidUrl(resource.metadataSource)) {
    return [{ propertyName: "metadataSource", errorMessage: "Invalid Format" }];
  }
  return [];
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function developmentConfigController(
  configFileProvider: ConfigFileProvider,
  configService: IConfigService
): Router {
  const router = Router();

  const validators = {
    sharedValidator: developmentConfigSharedValidator,
    putValidator: () => [],
    postValidator: () => [],
  };

  function getConfig(): DevelopmentConfigResource {
    return { ...toDevelopmentConfigResource(configFileProvider, configService), id: 1 };
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
      const resource = req.body as DevelopmentConfigResource;

      if (resource && !resource.id && req.params["id"] !== undefined) {
        resource.id = Number.parseInt(req.params["id"], 10);
      }

      validateResource(resource, "PUT", requestPath(req), validators);

      if (req.params["id"] !== undefined) {
        validateId(Number.parseInt(req.params["id"] ?? "", 10));
      }

      const dictionary = toDictionary(resource);
      configFileProvider.saveConfigDictionary(dictionary);
      configService.saveConfigDictionary(dictionary);

      res.status(202).json(stripDefaultId(getConfig()));
    })
  );

  return router;
}
