import { Router, type Request } from "express";
import type {
  IProvider,
  IProviderConfig,
  IProviderFactory,
  ProviderDefinition,
} from "../../thingi-provider/index.js";
import { ValidationException } from "../../validation/validationResult.js";
import type { ValidationFailure } from "../../validation/validationResult.js";
import { BadRequestException } from "./BadRequestException.js";
import { combineValidators, noopValidator, type ResourceValidator } from "./ResourceValidator.js";
import { requestPath, validateResource } from "./RestController.js";
import { stripDefaultId } from "./RestResource.js";
import {
  providerResourceMapper,
  type ProviderResource,
  type ProviderSettingsSchema,
} from "./ProviderResource.js";
import {
  ApplyTags,
  defaultUpdateBulkModel,
  type ProviderBulkResource,
} from "./ProviderBulkResource.js";

/**
 * Ported from Readarr.Api.V1/ProviderControllerBase.cs.
 *
 * ## Why a factory function, not a base class
 *
 * Same rationale as rest/RestController.ts: C#'s
 * `ProviderControllerBase<TProviderResource, TBulkProviderResource,
 * TProvider, TProviderDefinition> : RestController<TProviderResource>` is
 * an inheritance-based MVC base every provider-kind controller
 * (`IndexerController`, `DownloadClientController`,
 * `NotificationController`, `ImportListController`) subclasses. This port's
 * `providerControllerBase()` is a factory that takes an
 * `IProviderFactory<TProvider, TProviderConfig>` (the real, already-ported
 * generic base from thingi-provider/ProviderFactory.ts) plus the mapper
 * wiring from ProviderResource.ts/ProviderBulkResource.ts, and returns a
 * fully wired Express `Router` implementing every route the real base
 * class provides. It is built ON TOP of `restController()`
 * (rest/RestController.ts) for the five base CRUD routes, then adds the
 * provider-specific ones (`bulk`, `schema`, `test`, `testall`,
 * `action/:name`) directly, exactly mirroring the real class's own
 * `RestController<TResource>` inheritance + its own additional `[Http*]`-
 * attributed actions.
 *
 * ## Routes mounted (all ported faithfully from the real source)
 *
 *   GET    /              -> all definitions, `_providerFactory.All()`
 *                             ordered by name (final `.OrderBy(p => p.Name)`
 *                             -- the source's intermediate
 *                             `OrderBy(ImplementationName)` before mapping
 *                             is dropped since only the FINAL order is
 *                             externally observable and it's fully
 *                             overwritten by the trailing OrderBy(Name))
 *   GET    /:id           -> `GetResourceById`, via restController's getById
 *   POST   /              -> create (see "Create/Update test semantics" below)
 *   PUT    /:id           -> update (see "Create/Update test semantics" below)
 *   PUT    /bulk          -> bulk tag apply (Add/Remove/Replace) + bulk update
 *   DELETE /:id           -> delete
 *   DELETE /bulk          -> bulk delete
 *   GET    /schema        -> default definitions (one per registered
 *                             provider type) with `presets` populated
 *   POST   /test          -> test a (possibly not-yet-saved) definition
 *                             without persisting it; SkipValidation(true, false)
 *                             (postValidator skipped, sharedValidator still runs)
 *   POST   /testall       -> test every enabled definition whose settings
 *                             currently validate; 400 if any failed
 *   POST   /action/:name  -> `_providerFactory.requestAction(...)` passthrough;
 *                             SkipValidation() i.e. skip=true, skipShared=true
 *                             (BOTH validators skipped -- matches the real
 *                             `[SkipValidation]` bare attribute's default args)
 *
 * ## Create/Update test semantics (ported from CreateProvider/UpdateProvider)
 *
 *   POST /  : builds the definition (running shared+post validators unless
 *             the request path ends in "/test" -- N/A here since this is
 *             literally the "/" route, kept for behavioral parity with
 *             restController's shared validateResource path), tests it
 *             if `definition.enable` is true, UNLESS `forceSave=true` query
 *             param. Then creates + returns 201.
 *   PUT /:id: builds the definition (shared+put validators), tests it if
 *             `definition.enable && !forceSave` (note: stricter than
 *             POST's "test if enabled unless forceSave" -- forceSave on PUT
 *             ALSO skips testing regardless of includeWarnings semantics,
 *             ported exactly: `if (providerDefinition.Enable && !forceSave)`).
 *             Then updates + returns 202.
 *
 * `Test()`'s `includeWarnings` parameter: POST passes `!forceSave` (warnings
 * fail the request unless forceSave); PUT's inner `Test(definition, true)`
 * call ALWAYS passes `true` for includeWarnings (ported literally --
 * `Test(providerDefinition, true)` inside the `if (... && !forceSave)`
 * block; since forceSave already gates whether Test runs at all on PUT,
 * the includeWarnings arg passed when it DOES run is unconditionally true).
 *
 * ## VerifyValidationResult (ported from Validate()/Test()'s shared tail)
 *
 * Both `Validate()` (settings-level, always run when validate=true) and
 * `Test()` (provider connectivity/live check) funnel through the same
 * `VerifyValidationResult(result, includeWarnings)`: if `includeWarnings`
 * and (invalid OR has warnings), OR just invalid regardless of
 * includeWarnings, throw `ValidationException` with the result's failures.
 * Ported as `verifyValidationResult()` below, operating on this port's
 * `ValidationResult` shape (validation/validationResult.ts, already used
 * throughout this codebase) rather than a new type.
 *
 * ## `resourceMapper` -- the `ProviderResourceMapper` extension seam
 *
 * The real C# `ProviderControllerBase<TProviderResource,
 * TBulkProviderResource, TProvider, TProviderDefinition>` takes a
 * `TProviderResourceMapper ResourceMapper` CONSTRUCTOR argument specifically
 * so a concrete controller (e.g. `IndexerResourceMapper : ProviderResourceMapper
 * <IndexerResource, IndexerDefinition>`) can override `ToResource`/`ToModel`
 * to add its own extra top-level resource fields beyond the generic
 * `Fields: List<Field>` settings array (`IndexerResource.EnableRss`,
 * `NotificationResource.OnGrab`, `DownloadClientResource.Priority`, etc.).
 * This factory's optional `resourceMapper` option is that same seam: when
 * supplied, it's used INSTEAD of the internally-constructed default
 * `providerResourceMapper(settingsSchema, wikiSlug)` for every
 * toResource/toModel call this function makes (GET /, GET /:id, GET
 * /schema incl. presets, POST /, PUT /:id, PUT /bulk). Omitting it keeps
 * the exact prior behavior (the generic base mapper, additive/
 * backward-compatible -- no existing caller needs to change).
 *
 * `TProviderResource`/`TProviderDefinitionWide` let a concrete controller's
 * mapper operate on ITS OWN widened resource/definition shapes (e.g.
 * `IndexerResource`/`IndexerProviderDefinition`) while every other part of
 * this factory (validation, `IProviderFactory<TProvider, TProviderConfig>`
 * CRUD, bulk-tag application) keeps working against the generic
 * `ProviderResource`/`ProviderDefinition<TProviderConfig>` base shapes --
 * safe because a concrete mapper's types are always structural supertypes
 * of the base (`IndexerResource extends ProviderResource`,
 * `IndexerProviderDefinition extends ProviderDefinition<IProviderConfig>`),
 * exactly mirroring the real C# generic's own covariant relationship
 * between `TProviderResourceMapper` and the class's `TProviderResource`/
 * `TProviderDefinition` parameters.
 */

export interface ProviderControllerOptions<
  TProvider extends IProvider<TProviderConfig>,
  TProviderConfig extends IProviderConfig,
  TProviderResource extends ProviderResource = ProviderResource,
  TProviderDefinitionWide extends ProviderDefinition<TProviderConfig> =
    ProviderDefinition<TProviderConfig>,
> {
  providerFactory: IProviderFactory<TProvider, TProviderConfig>;
  settingsSchema: ProviderSettingsSchema<TProviderConfig>;
  /** Ported from ProviderResourceMapper's `InfoLink` format string's `readarr` slug -- see ProviderResource.ts's `providerResourceMapper` doc comment. Ignored when `resourceMapper` is supplied (the caller's own mapper owns InfoLink formatting then). */
  wikiSlug?: string;
  /** Extra shared/post validator rules layered on top of the four base rules every concrete controller wires up (name/implementation/configContract/fields-not-null) -- see module doc comment's SharedValidator/PostValidator bullet. */
  extraSharedValidator?: ResourceValidator<ProviderResource>;
  extraPostValidator?: ResourceValidator<ProviderResource>;
  /** Ported from `ProviderBulkResourceMapper.UpdateModel`'s override seam -- defaults to the base no-op pass-through (defaultUpdateBulkModel). */
  updateBulkModel?: (
    resource: ProviderBulkResource | null | undefined,
    existingDefinitions: ProviderDefinition<TProviderConfig>[]
  ) => ProviderDefinition<TProviderConfig>[];
  /**
   * Ported from the real base class's `TProviderResourceMapper ResourceMapper`
   * constructor argument -- see this module's doc comment's "resourceMapper"
   * section. Optional; defaults to `providerResourceMapper(settingsSchema,
   * wikiSlug)` (the generic base mapper, prior behavior unchanged) when
   * omitted.
   */
  resourceMapper?: {
    toResource: (definition: TProviderDefinitionWide) => TProviderResource;
    toModel: (resource: TProviderResource | null | undefined) => TProviderDefinitionWide;
  };
}

/** Ported from ProviderControllerBase's private `VerifyValidationResult`. */
function verifyValidationResult(
  result: { isValid: boolean; hasWarnings: boolean; errors: ValidationFailure[] },
  includeWarnings: boolean
): void {
  if (includeWarnings && (!result.isValid || result.hasWarnings)) {
    throw new ValidationException(result.errors);
  }

  if (!result.isValid) {
    throw new ValidationException(result.errors);
  }
}

function parseForceFlag(req: Request, name: string): boolean {
  const raw = req.query[name];
  return raw === "true" || raw === "1";
}

export function providerControllerBase<
  TProvider extends IProvider<TProviderConfig>,
  TProviderConfig extends IProviderConfig,
  TProviderResource extends ProviderResource = ProviderResource,
  TProviderDefinitionWide extends ProviderDefinition<TProviderConfig> =
    ProviderDefinition<TProviderConfig>,
>(
  options: ProviderControllerOptions<
    TProvider,
    TProviderConfig,
    TProviderResource,
    TProviderDefinitionWide
  >
): Router {
  const { providerFactory, settingsSchema, wikiSlug } = options;
  // Ported extension seam -- see module doc comment's "resourceMapper"
  // section. A caller-supplied mapper is used INSTEAD of the internal
  // generic default; omitting it keeps prior behavior unchanged (the cast
  // is safe because the default's own toResource/toModel are typed exactly
  // `ProviderResource`/`ProviderDefinition<TProviderConfig>`, which are
  // `TProviderResource`/`TProviderDefinitionWide`'s own default type
  // arguments when no custom mapper -- and therefore no narrower generics
  // -- are supplied).
  const mapper =
    options.resourceMapper ??
    (providerResourceMapper<TProviderConfig>(settingsSchema, wikiSlug) as unknown as {
      toResource: (definition: TProviderDefinitionWide) => TProviderResource;
      toModel: (resource: TProviderResource | null | undefined) => TProviderDefinitionWide;
    });
  const updateBulkModel = options.updateBulkModel ?? defaultUpdateBulkModel;

  // Ported from the ctor's SharedValidator/PostValidator rules:
  //   SharedValidator.RuleFor(c => c.Name).NotEmpty();
  //   SharedValidator.RuleFor(c => c.Name).Must(unique-ignoring-self);
  //   SharedValidator.RuleFor(c => c.Implementation).NotEmpty();
  //   SharedValidator.RuleFor(c => c.ConfigContract).NotEmpty();
  //   PostValidator.RuleFor(c => c.Fields).NotNull();
  const baseSharedValidator: ResourceValidator<ProviderResource> = (resource) => {
    const failures: ValidationFailure[] = [];

    if (!resource.name || resource.name.trim() === "") {
      failures.push({ propertyName: "name", errorMessage: "'Name' must not be empty." });
    } else {
      const duplicate = providerFactory
        .all()
        .some((p) => p.name.toLowerCase() === resource.name.toLowerCase() && p.id !== resource.id);
      if (duplicate) {
        failures.push({ propertyName: "name", errorMessage: "Should be unique" });
      }
    }

    if (!resource.implementation || resource.implementation.trim() === "") {
      failures.push({
        propertyName: "implementation",
        errorMessage: "'Implementation' must not be empty.",
      });
    }

    if (!resource.configContract || resource.configContract.trim() === "") {
      failures.push({
        propertyName: "configContract",
        errorMessage: "'Config Contract' must not be empty.",
      });
    }

    return failures;
  };

  const basePostValidator: ResourceValidator<ProviderResource> = (resource) => {
    if (resource.fields === null || resource.fields === undefined) {
      return [{ propertyName: "fields", errorMessage: "'Fields' must not be empty." }];
    }
    return [];
  };

  const sharedValidator = options.extraSharedValidator
    ? combineValidators(baseSharedValidator, options.extraSharedValidator)
    : baseSharedValidator;
  const postValidator = options.extraPostValidator
    ? combineValidators(basePostValidator, options.extraPostValidator)
    : basePostValidator;
  const putValidator = noopValidator<ProviderResource>();

  const validators = { sharedValidator, postValidator, putValidator };

  /** Ported from GetResourceById: fetches the definition, stamps characteristics, maps to resource. Used by GET /:id, and by Created/Accepted-equivalent responses after create/update. */
  function getResourceById(id: number): TProviderResource {
    const definition = providerFactory.get(id);
    providerFactory.setProviderCharacteristics(definition);
    return mapper.toResource(definition as TProviderDefinitionWide);
  }

  /**
   * Ported from the shared `GetDefinition(providerResource, validate,
   * includeWarnings, forceValidate)` private helper.
   *
   * ## Ordering note: resource-shaped validation runs BEFORE mapping
   *
   * In the real C# MVC pipeline, `RestController.OnActionExecuting`
   * (the resource/shared/post/put validation ported by
   * `validateResource()`/`rest/RestController.ts`) is an ASP.NET action
   * FILTER: it runs before the controller action method
   * (`CreateProvider`/`UpdateProvider`, which is what calls this
   * `GetDefinition` helper and, inside it, `_resourceMapper.ToModel`) is
   * ever invoked at all. So the real, observable order for a request is:
   *   1. `OnActionExecuting` validates the raw `TProviderResource` --
   *      throws `ValidationException` on failure, action method never runs.
   *   2. Only if that passed does `CreateProvider`/`UpdateProvider` run and
   *      call `GetDefinition`, which then maps `TProviderResource ->
   *      TProviderDefinition` via `ToModel` (client-schema field lookup)
   *      and does the settings-level `Validate()` check.
   * This function's own parameter order (mapping arguments before
   * `method`/`requestPath`) doesn't reflect this -- it's fixed here by
   * calling `validateResource()` FIRST, before `mapper.toModel()`. Getting
   * this backwards (mapping before resource-validation) is an easy mistake
   * because `restController()`'s own base CRUD routes structurally can't
   * get it wrong (the resource IS the model there, no separate mapping
   * step exists to accidentally run first) -- ProviderControllerBase is
   * the one place in this module where a real ordering bug is possible,
   * and was caught by this module's own test suite: an absent/malformed
   * `fields` array must produce the real PostValidator "'Fields' must not
   * be empty" 400, not an unrelated crash from `readFromFieldSchema`
   * running first against an undefined array.
   */
  function getDefinition(
    resource: TProviderResource,
    validate: boolean,
    includeWarnings: boolean,
    forceValidate: boolean,
    method: "POST" | "PUT",
    requestPath: string
  ): TProviderDefinitionWide {
    // Ported from OnActionExecuting's resource-shaped validation (shared/post/put rules) -- runs first, see doc comment above.
    validateResource(resource, method, requestPath, validators);

    const definition = mapper.toModel(resource);

    if (validate && (definition.enable || forceValidate)) {
      // Ported from `Validate(definition, includeWarnings)`: settings-level validation.
      const settingsResult = definition.settings?.validate() ?? {
        isValid: true,
        hasWarnings: false,
        errors: [],
      };
      verifyValidationResult(settingsResult, includeWarnings);
    }

    return definition;
  }

  async function test(
    definition: TProviderDefinitionWide,
    includeWarnings: boolean
  ): Promise<void> {
    const result = await providerFactory.test(definition);
    verifyValidationResult(result, includeWarnings);
  }

  const router = Router();

  // ---- GET / ----------------------------------------------------------
  router.get("/", (_req, res) => {
    const definitions = providerFactory.all();
    for (const definition of definitions) {
      providerFactory.setProviderCharacteristics(definition);
    }

    const result = definitions
      .map((d) => mapper.toResource(d as TProviderDefinitionWide))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(result.map(stripDefaultId));
  });

  // ---- GET /schema -----------------------------------------------------
  // Mounted BEFORE "/:id" so Express doesn't treat "schema" as an :id value.
  router.get("/schema", (_req, res) => {
    const defaultDefinitions = [...providerFactory.getDefaultDefinitions()].sort((a, b) =>
      a.implementationName.localeCompare(b.implementationName)
    );

    const result = defaultDefinitions.map((definition) => {
      const resource = mapper.toResource(definition as TProviderDefinitionWide);
      const presetDefinitions = providerFactory.getPresetDefinitions(definition);
      resource.presets = presetDefinitions.map((preset) =>
        mapper.toResource(preset as TProviderDefinitionWide)
      );
      return resource;
    });

    res.json(result.map(stripDefaultId));
  });

  // ---- POST /testall -----------------------------------------------------
  router.post("/testall", (_req, res, next) => {
    void (async () => {
      try {
        const candidates = providerFactory
          .all()
          .filter((c) => (c.settings?.validate().isValid ?? false) && c.enable);

        const results: { id: number; isValid: boolean; validationFailures: ValidationFailure[] }[] =
          [];

        for (const definition of candidates) {
          const validationResult = await providerFactory.test(definition);
          results.push({
            id: definition.id,
            isValid: validationResult.isValid,
            validationFailures: validationResult.errors,
          });
        }

        const anyInvalid = results.some((r) => !r.isValid);
        res.status(anyInvalid ? 400 : 200).json(results);
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- POST /test --------------------------------------------------------
  // Ported: [SkipValidation(true, false)] -- postValidator skipped, sharedValidator still runs.
  router.post("/test", (req, res, next) => {
    void (async () => {
      try {
        const resource = req.body as TProviderResource;
        const forceTest = parseForceFlag(req, "forceTest");

        if (!resource) {
          throw new BadRequestException("Request body can't be empty");
        }
        validateResource(resource, "POST", requestPath(req), validators, {
          skipValidation: true,
          skipValidationShared: false,
        });

        const definition = mapper.toModel(resource);
        if (definition.enable || !forceTest) {
          const settingsResult = definition.settings?.validate() ?? {
            isValid: true,
            hasWarnings: false,
            errors: [],
          };
          verifyValidationResult(settingsResult, !forceTest);
        }

        await test(definition, true);

        res.json({});
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- POST /action/:name -------------------------------------------------
  // Ported: [SkipValidation] bare attribute -- skip=true, skipShared=true (both validators skipped, but OnActionExecuting's "resource can't be null" check still runs unconditionally -- see validateResource()'s own doc comment).
  router.post("/action/:name", (req, res, next) => {
    void (async () => {
      try {
        const resource = req.body as TProviderResource;
        validateResource(resource, "POST", requestPath(req), validators, {
          skipValidation: true,
          skipValidationShared: true,
        });

        const definition = mapper.toModel(resource);

        const query: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.query)) {
          query[key] = typeof value === "string" ? value : JSON.stringify(value);
        }

        const data = await providerFactory.requestAction(
          definition,
          req.params["name"] ?? "",
          query
        );
        res.json(data ?? {});
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- PUT /bulk -----------------------------------------------------------
  router.put("/bulk", (req, res, next) => {
    void (async () => {
      try {
        const bulkResource = req.body as ProviderBulkResource;

        if (!bulkResource.ids || bulkResource.ids.length === 0) {
          throw new BadRequestException("ids must be provided");
        }

        const definitionsToUpdate = providerFactory.getMany(bulkResource.ids);

        for (const definition of definitionsToUpdate) {
          providerFactory.setProviderCharacteristics(definition);

          if (bulkResource.tags) {
            const newTags = bulkResource.tags;
            switch (bulkResource.applyTags) {
              case ApplyTags.Add:
                for (const t of newTags) {
                  if (!definition.tags.includes(t)) {
                    definition.tags.push(t);
                  }
                }
                break;
              case ApplyTags.Remove:
                definition.tags = definition.tags.filter((t) => !newTags.includes(t));
                break;
              case ApplyTags.Replace:
                definition.tags = [...new Set(newTags)];
                break;
              default:
                break;
            }
          }
        }

        const updated = updateBulkModel(bulkResource, definitionsToUpdate);
        const result = providerFactory.updateMany(updated);

        res
          .status(202)
          .json(result.map((d) => stripDefaultId(mapper.toResource(d as TProviderDefinitionWide))));
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- DELETE /bulk ----------------------------------------------------
  router.delete("/bulk", (req, res, next) => {
    try {
      const bulkResource = req.body as ProviderBulkResource;
      providerFactory.deleteMany(bulkResource.ids ?? []);
      res.json({});
    } catch (err) {
      next(err);
    }
  });

  // ---- GET /:id ----------------------------------------------------------
  router.get("/:id", (req, res, next) => {
    try {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      const resource = getResourceById(id);
      res.json(stripDefaultId(resource));
    } catch (err) {
      next(err);
    }
  });

  // ---- POST / (create) -----------------------------------------------------
  router.post("/", (req, res, next) => {
    void (async () => {
      try {
        const resource = req.body as TProviderResource;
        const forceSave = parseForceFlag(req, "forceSave");

        const definition = getDefinition(
          resource,
          true,
          !forceSave,
          false,
          "POST",
          requestPath(req)
        );

        if (definition.enable) {
          await test(definition, !forceSave);
        }

        const created = providerFactory.create(definition);

        res.status(201).json(stripDefaultId(getResourceById(created.id)));
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- PUT /:id (update) ----------------------------------------------------
  router.put("/:id", (req, res, next) => {
    void (async () => {
      try {
        const resource = req.body as TProviderResource;
        const routeId = Number.parseInt(req.params["id"] ?? "", 10);

        if (!resource.id) {
          resource.id = routeId;
        }
        if (!(Number.isInteger(routeId) && routeId > 0)) {
          throw new BadRequestException(`${routeId} is not a valid ID`);
        }

        const forceSave = parseForceFlag(req, "forceSave");

        const definition = getDefinition(
          resource,
          true,
          !forceSave,
          false,
          "PUT",
          requestPath(req)
        );

        // Ported: "Only test existing definitions if it is enabled and forceSave isn't set."
        if (definition.enable && !forceSave) {
          await test(definition, true);
        }

        providerFactory.update(definition);

        res.status(202).json(stripDefaultId(getResourceById(resource.id)));
      } catch (err) {
        next(err);
      }
    })();
  });

  // ---- DELETE /:id -----------------------------------------------------
  router.delete("/:id", (req, res, next) => {
    try {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      if (!(Number.isInteger(id) && id > 0)) {
        throw new BadRequestException(`${id} is not a valid ID`);
      }

      providerFactory.delete(id);
      res.json({});
    } catch (err) {
      next(err);
    }
  });

  return router;
}
