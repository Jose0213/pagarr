import type { INamingConfigService } from "../../../media-files-organize/organizer/namingConfigService.js";
import type { IFilenameSampleService } from "../../../media-files-organize/organizer/fileNameSampleService.js";
import type { IFilenameValidationService } from "../../../media-files-organize/organizer/fileNameValidationService.js";
import type { FileNameBuilder } from "../../../media-files-organize/organizer/fileNameBuilder.js";
import {
  ColonReplacementFormat,
  type BasicNamingConfig,
  type NamingConfig,
} from "../../../media-files-organize/organizer/namingConfig.js";
import {
  validateAuthorFolderFormat,
  validateBookFormat,
} from "../../../media-files-organize/organizer/fileNameValidation.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import { requestPath, validateId, validateResource } from "../../rest/RestController.js";
import { stripDefaultId, type RestResource } from "../../rest/RestResource.js";
import type { NamingExampleResource } from "./NamingExampleResource.js";
import { Router, type Request, type Response, type NextFunction } from "express";

/**
 * Ported from Readarr.Api.V1/Config/{NamingConfigResource,
 * NamingConfigController}.cs. Mount path: `/api/v1/config/naming`.
 *
 * Wraps the already-ported `media-files-organize/organizer/` module
 * (`NamingConfigService`/`FileNameSampleService`/`FileNameValidationService`/
 * `FileNameBuilder`) -- all real, not forward-refs. `IncludeAuthorName`/
 * `IncludeBookTitle`/`IncludeQuality`/`ReplaceSpaces`/`Separator`/
 * `NumberStyle` are NOT persisted columns on `NamingConfig` (see
 * organizer/namingConfig.ts) -- they're computed read-only fields the real
 * `GetNamingConfig()` layers on top via `BasicNamingConfig.AddToResource`
 * (only when `StandardBookFormat` is non-blank -- ported exactly, see
 * `getNamingConfigResource` below), and the real `NamingConfigResourceMapper
 * .ToModel()` never reads them back off the resource on PUT (`NamingConfig`
 * has no such properties to set) -- this port's `toNamingConfig` mirrors
 * that by simply not touching them either.
 */
export interface NamingConfigResource extends RestResource {
  renameBooks: boolean;
  replaceIllegalCharacters: boolean;
  colonReplacementFormat: number;
  standardBookFormat: string;
  authorFolderFormat: string;
  includeAuthorName: boolean;
  includeBookTitle: boolean;
  includeQuality: boolean;
  replaceSpaces: boolean;
  separator: string;
  numberStyle: string | null;
}

/** Ported from NamingConfigResourceMapper.ToResource(this NamingConfig model). */
export function namingConfigToResource(model: NamingConfig): NamingConfigResource {
  return {
    id: model.id,
    renameBooks: model.renameBooks,
    replaceIllegalCharacters: model.replaceIllegalCharacters,
    colonReplacementFormat: model.colonReplacementFormat,
    standardBookFormat: model.standardBookFormat,
    authorFolderFormat: model.authorFolderFormat,
    includeAuthorName: false,
    includeBookTitle: false,
    includeQuality: false,
    replaceSpaces: false,
    separator: "",
    numberStyle: null,
  };
}

/** Ported from NamingConfigResourceMapper.AddToResource(this BasicNamingConfig, NamingConfigResource). Mutates resource in place, matching the C# extension method's `this` receiver. */
export function addBasicNamingConfigToResource(
  basicNamingConfig: BasicNamingConfig,
  resource: NamingConfigResource
): void {
  resource.includeAuthorName = basicNamingConfig.includeAuthorName;
  resource.includeBookTitle = basicNamingConfig.includeBookTitle;
  resource.includeQuality = basicNamingConfig.includeQuality;
  resource.replaceSpaces = basicNamingConfig.replaceSpaces;
  resource.separator = basicNamingConfig.separator;
  resource.numberStyle = basicNamingConfig.numberStyle;
}

/** Ported from NamingConfigResourceMapper.ToModel(this NamingConfigResource resource). */
export function namingConfigToModel(resource: NamingConfigResource): NamingConfig {
  return {
    id: resource.id,
    renameBooks: resource.renameBooks,
    replaceIllegalCharacters: resource.replaceIllegalCharacters,
    colonReplacementFormat: resource.colonReplacementFormat,
    standardBookFormat: resource.standardBookFormat,
    authorFolderFormat: resource.authorFolderFormat,
  };
}

/** Ported from NamingConfigController's ctor SharedValidator rules: `StandardBookFormat`/`AuthorFolderFormat` via FileNameValidation.ts's ported predicates. */
export function namingConfigSharedValidator(resource: NamingConfigResource): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  const bookFormatError = validateBookFormat(resource.standardBookFormat);
  if (bookFormatError) {
    failures.push({ propertyName: "standardBookFormat", errorMessage: bookFormatError });
  }

  const authorFolderError = validateAuthorFolderFormat(resource.authorFolderFormat);
  if (authorFolderError) {
    failures.push({ propertyName: "authorFolderFormat", errorMessage: authorFolderError });
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

export interface NamingConfigControllerDeps {
  namingConfigService: INamingConfigService;
  filenameSampleService: IFilenameSampleService;
  filenameValidationService: IFilenameValidationService;
  filenameBuilder: FileNameBuilder;
}

/** Ported from NamingConfigController.GetNamingConfig(). */
function getNamingConfigResource(deps: NamingConfigControllerDeps): NamingConfigResource {
  const nameSpec = deps.namingConfigService.getConfig();
  const resource = namingConfigToResource(nameSpec);

  if (resource.standardBookFormat.trim() !== "") {
    const basicConfig = deps.filenameBuilder.getBasicNamingConfig(nameSpec);
    addBasicNamingConfigToResource(basicConfig, resource);
  }

  return resource;
}

/**
 * Ported from NamingConfigController.ValidateFormatResult: builds a standard
 * track sample against the submitted spec and runs it through
 * `FileNameValidationService.validateTrackFilename()` -- throws
 * `ValidationException` (via `validateResource`'s caller, see route handler
 * below) collecting any non-null failures, deduped by property name. NOTE:
 * `FileNameValidationService.validateTrackFilename()` is real, ported code
 * that unconditionally returns `null` (see that file's own doc comment --
 * the C# source itself has this validation logic commented out/dead) --
 * this always finds zero failures in practice, faithfully preserving the
 * real (non-functional) behavior rather than inventing real validation.
 */
function validateFormatResult(deps: NamingConfigControllerDeps, nameSpec: NamingConfig): void {
  // Ported from `_filenameSampleService.GetStandardTrackSample(nameSpec)`
  // followed by `_filenameValidationService.ValidateTrackFilename(...)` --
  // building the sample is kept for fidelity with the real call sequence,
  // even though this port's validateTrackFilename() (see module doc
  // comment) always returns null regardless of input, so nothing is ever
  // accumulated into a ValidationException here -- matching the real,
  // currently-inert behavior rather than inventing real validation.
  deps.filenameSampleService.getStandardTrackSample(nameSpec);
  deps.filenameValidationService.validateTrackFilename();
}

export function namingConfigController(deps: NamingConfigControllerDeps): Router {
  const router = Router();

  const validators = {
    sharedValidator: namingConfigSharedValidator,
    putValidator: () => [],
    postValidator: () => [],
  };

  router.get(
    "/",
    asyncHandler((_req, res) => {
      res.json(stripDefaultId(getNamingConfigResource(deps)));
    })
  );

  // Ported from `[HttpGet("examples")] GetExamples([FromQuery]NamingConfigResource config)`.
  // MUST be registered before the `/:id` route below: ASP.NET's attribute
  // routing always prefers a literal route template ("examples") over a
  // constrained-parameter one ({id:int}, which wouldn't even match a
  // non-numeric segment) regardless of declaration order, but Express
  // matches middleware/routes strictly in registration order -- mounting
  // `/:id` first would otherwise swallow `GET /examples` as if it were
  // `GET /:id` with `id="examples"`. Verified directly: this ordering
  // mistake was caught by this module's own test suite (see
  // __tests__/NamingConfigResource.test.ts's "/examples" tests), not
  // assumed correct.
  router.get(
    "/examples",
    asyncHandler((req, res) => {
      const query = req.query as Record<string, string | undefined>;
      const queryId = query["id"] !== undefined ? Number.parseInt(query["id"], 10) : 0;

      let config: NamingConfigResource;
      if (!queryId) {
        config = getNamingConfigResource(deps);
      } else {
        config = {
          id: queryId,
          renameBooks: query["renameBooks"] === "true",
          replaceIllegalCharacters: query["replaceIllegalCharacters"] !== "false",
          colonReplacementFormat: query["colonReplacementFormat"]
            ? Number.parseInt(query["colonReplacementFormat"], 10)
            : ColonReplacementFormat.Smart,
          standardBookFormat: query["standardBookFormat"] ?? "",
          authorFolderFormat: query["authorFolderFormat"] ?? "",
          includeAuthorName: false,
          includeBookTitle: false,
          includeQuality: false,
          replaceSpaces: false,
          separator: "",
          numberStyle: null,
        };
      }

      const nameSpec = namingConfigToModel(config);

      const singleTrackSampleResult = deps.filenameSampleService.getStandardTrackSample(nameSpec);
      const multiDiscTrackSampleResult =
        deps.filenameSampleService.getMultiDiscTrackSample(nameSpec);

      const singleValid = deps.filenameValidationService.validateTrackFilename() === null;
      const multiValid = deps.filenameValidationService.validateTrackFilename() === null;

      const sampleResource: NamingExampleResource = {
        singleBookExample: singleValid ? singleTrackSampleResult.fileName : null,
        multiPartBookExample: multiValid ? multiDiscTrackSampleResult.fileName : null,
        authorFolderExample:
          nameSpec.authorFolderFormat.trim() === ""
            ? null
            : deps.filenameSampleService.getAuthorFolderSample(nameSpec),
      };

      res.json(sampleResource);
    })
  );

  router.get(
    "/:id",
    asyncHandler((_req, res) => {
      res.json(stripDefaultId(getNamingConfigResource(deps)));
    })
  );

  router.put(
    "/:id?",
    asyncHandler((req, res) => {
      const resource = req.body as NamingConfigResource;

      if (resource && !resource.id && req.params["id"] !== undefined) {
        resource.id = Number.parseInt(req.params["id"], 10);
      }

      validateResource(resource, "PUT", requestPath(req), validators);

      if (req.params["id"] !== undefined) {
        validateId(Number.parseInt(req.params["id"] ?? "", 10));
      }

      const nameSpec = namingConfigToModel(resource);
      validateFormatResult(deps, nameSpec);

      deps.namingConfigService.save(nameSpec);

      res.status(202).json(stripDefaultId(getNamingConfigResource(deps)));
    })
  );

  return router;
}
