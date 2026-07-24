import type { ConfigFileProvider } from "../../../config/configFileProvider.js";
import type { IConfigService } from "../../../config/configService.js";
import { getAllLanguages } from "../../../languages/language.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import { requestPath, validateId, validateResource } from "../../rest/RestController.js";
import { stripDefaultId, type RestResource } from "../../rest/RestResource.js";
import { Router, type Request, type Response, type NextFunction } from "express";

/**
 * Ported from Readarr.Api.V1/Config/{UiConfigResource,UiConfigController}.cs.
 * Mount path: `/api/v1/config/ui`.
 *
 * `UiConfigController : ConfigController<UiConfigResource>` but OVERRIDES
 * `SaveConfig` (`[RestPutById] public override ActionResult<UiConfigResource>
 * SaveConfig(...)`) to ALSO persist into `IConfigFileProvider` (for
 * `Theme`, which lives in the bootstrap config file, not the DB-backed
 * `IConfigService` -- see config/configFileProvider.ts's own `theme`
 * property) in addition to `IConfigService`. Ported directly rather than
 * reusing `configControllerBase.ts`'s `configController()` factory (which
 * only knows about a single `IConfigService.saveConfigDictionary` call) --
 * this is the one Config subclass with a second config-writing side effect.
 */
export interface UiConfigResource extends RestResource {
  firstDayOfWeek: number;
  calendarWeekColumnHeader: string;
  shortDateFormat: string;
  longDateFormat: string;
  timeFormat: string;
  showRelativeDates: boolean;
  enableColorImpairedMode: boolean;
  uiLanguage: number;
  theme: string;
}

/** Ported from UiConfigResourceMapper.ToResource(IConfigFileProvider, IConfigService). */
export function toUiConfigResource(
  configFileProvider: ConfigFileProvider,
  model: IConfigService
): Omit<UiConfigResource, "id"> {
  return {
    firstDayOfWeek: model.firstDayOfWeek,
    calendarWeekColumnHeader: model.calendarWeekColumnHeader,
    shortDateFormat: model.shortDateFormat,
    longDateFormat: model.longDateFormat,
    timeFormat: model.timeFormat,
    showRelativeDates: model.showRelativeDates,
    enableColorImpairedMode: model.enableColorImpairedMode,
    uiLanguage: model.uiLanguage,
    theme: configFileProvider.theme,
  };
}

/**
 * camelCase keys matching `IConfigService`/`ConfigFileProvider`'s own
 * property names, NOT the real C# reflection's PascalCase -- see
 * DownloadClientConfigResource.ts's doc comment for why. Ported from
 * SaveHostConfig's dictionary being passed to BOTH `_configFileProvider
 * .SaveConfigDictionary` and `_configService.SaveConfigDictionary` -- each
 * store ignores whichever keys it doesn't recognize (`theme` only exists on
 * `ConfigFileProvider`; everything else here only exists on
 * `ConfigService`), matching this same "same dictionary, both stores, each
 * ignores what it doesn't own" real behavior.
 */
function toConfigServiceDictionary(resource: UiConfigResource): Record<string, unknown> {
  return {
    firstDayOfWeek: resource.firstDayOfWeek,
    calendarWeekColumnHeader: resource.calendarWeekColumnHeader,
    shortDateFormat: resource.shortDateFormat,
    longDateFormat: resource.longDateFormat,
    timeFormat: resource.timeFormat,
    showRelativeDates: resource.showRelativeDates,
    enableColorImpairedMode: resource.enableColorImpairedMode,
    uiLanguage: resource.uiLanguage,
    theme: resource.theme,
  };
}

/**
 * Ported from UiConfigController's ctor SharedValidator rules: `UILanguage`
 * must match a known `Language.All` id (Custom rule), AND must be >= 1
 * ("The UI Language value cannot be less than 1") -- both rules run (not
 * short-circuited), matching FluentValidation's default per-property rule
 * accumulation (no `.Cascade(CascadeMode.Stop)` on this chain in the real
 * source).
 */
export function uiConfigSharedValidator(resource: UiConfigResource): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (!getAllLanguages().some((l) => l.id === resource.uiLanguage)) {
    failures.push({ propertyName: "uiLanguage", errorMessage: "Invalid UI Language value" });
  }

  if (resource.uiLanguage < 1) {
    failures.push({
      propertyName: "uiLanguage",
      errorMessage: "The UI Language value cannot be less than 1",
    });
  }

  return failures;
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function uiConfigController(
  configFileProvider: ConfigFileProvider,
  configService: IConfigService
): Router {
  const router = Router();

  const validators = {
    sharedValidator: uiConfigSharedValidator,
    putValidator: () => [],
    postValidator: () => [],
  };

  function getConfig(): UiConfigResource {
    return { ...toUiConfigResource(configFileProvider, configService), id: 1 };
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
      const resource = req.body as UiConfigResource;

      if (resource && !resource.id && req.params["id"] !== undefined) {
        resource.id = Number.parseInt(req.params["id"], 10);
      }

      validateResource(resource, "PUT", requestPath(req), validators);

      if (req.params["id"] !== undefined) {
        validateId(Number.parseInt(req.params["id"] ?? "", 10));
      }

      // Ported: SaveConfig persists into BOTH IConfigFileProvider (Theme) AND
      // IConfigService (everything else) -- see module doc comment.
      const dictionary = toConfigServiceDictionary(resource);
      configFileProvider.saveConfigDictionary(dictionary);
      configService.saveConfigDictionary(dictionary);

      res.status(202).json(stripDefaultId(getConfig()));
    })
  );

  return router;
}
