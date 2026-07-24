import { Router, type Request, type Response, type NextFunction } from "express";
import type { CustomFormatService } from "../../../custom-formats/customFormatService.js";
import type { CustomFormat } from "../../../custom-formats/customFormat.js";
import { ReleaseTitleSpecification } from "../../../custom-formats/specifications/releaseTitleSpecification.js";
import { restController } from "../../rest/RestController.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import { ValidationException } from "../../../validation/validationResult.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import {
  allSpecificationDefaults,
  specificationToSchema,
  type CustomFormatSpecificationSchema,
} from "./CustomFormatSpecificationSchema.js";
import {
  customFormatToModel,
  customFormatToResource,
  type CustomFormatResource,
} from "./CustomFormatResource.js";

/**
 * Ported from Readarr.Api.V1/CustomFormats/CustomFormatController.cs.
 *
 * ```
 * public class CustomFormatController : RestController<CustomFormatResource>
 * {
 *     public CustomFormatController(ICustomFormatService formatService, List<ICustomFormatSpecification> specifications)
 *     {
 *         SharedValidator.RuleFor(c => c.Name).NotEmpty();
 *         SharedValidator.RuleFor(c => c.Name).Must(unique-ignoring-self).WithMessage("Must be unique.");
 *         SharedValidator.RuleFor(c => c.Specifications).NotEmpty();
 *         SharedValidator.RuleFor(c => c).Custom((customFormat, context) => { ... "Must contain at least one Condition" / "Condition name(s) cannot be empty..." ... });
 *     }
 *
 *     protected override CustomFormatResource GetResourceById(int id) => _formatService.GetById(id).ToResource(true);
 *
 *     [RestPostById] public ActionResult<CustomFormatResource> Create(...) { var model = ...ToModel(...); Validate(model); return Created(_formatService.Insert(model).Id); }
 *     [RestPutById]  public ActionResult<CustomFormatResource> Update(...) { var model = ...ToModel(...); Validate(model); _formatService.Update(model); return Accepted(model.Id); }
 *     [HttpGet]      public List<CustomFormatResource> GetAll() => _formatService.All().ToResource(true);
 *     [RestDeleteById] public void DeleteFormat(int id) => _formatService.Delete(id);
 *     [HttpGet("schema")] public object GetTemplates() { ... }
 * }
 * ```
 *
 * Plain CRUD -- `restController()`, not `providerControllerBase()` (a
 * CustomFormat isn't a `ThingiProvider`-kind pluggable provider; confirmed
 * directly against the real source: `RestController<CustomFormatResource>`).
 *
 * ## `Validate(model)` -- the SPECIFICATION-level validation, separate
 * from `SharedValidator`
 *
 * The real `Create`/`Update` actions run TWO layers of validation, in this
 * order:
 *   1. `OnActionExecuting`'s resource-shaped `SharedValidator` rules (name
 *      non-empty/unique, specifications non-empty, at-least-one-condition +
 *      condition-names-non-empty custom rule) -- runs BEFORE the action
 *      method at all (ported the same way `ProviderControllerBase.ts`'s own
 *      module doc comment describes this ordering for that sibling
 *      controller: `restController()`'s `validateResource()` call happens
 *      inside its own POST/PUT route wiring, before the `create`/`update`
 *      handler passed into it ever runs).
 *   2. THEN, inside the action method itself, `Validate(model)` iterates
 *      `definition.Specifications.Select(spec => spec.Validate())` --
 *      settings-level validation for EACH condition (e.g. `SizeSpecification`'s
 *      `Min >= 0`/`Max > Min`, `RegexSpecificationBase`'s non-empty pattern)
 *      -- and throws `ValidationException` on the first invalid one via
 *      `VerifyValidationResult` (no `includeWarnings` gate here --
 *      `CustomFormats`' own specifications never produce warnings, only
 *      errors -- see `ICustomFormatSpecification.validate()`'s
 *      `ValidationResult` shape: no `hasWarnings` field at all, unlike
 *      `ProviderControllerBase`'s richer settings validation). This is
 *      ported as `validateSpecifications()` below, called from both
 *      `create`/`update` handlers after the shared-validator pass, exactly
 *      mirroring the two-layer real sequence.
 *
 * ## `GET /schema` -- presets
 *
 * Ported from `GetTemplates()`: every registered specification's own
 * `ToSchema()` (via `allSpecificationDefaults()`), ordered by each spec's
 * own `Order` (matches `_specifications.OrderBy(x => x.Order)`), each with
 * `Presets` populated from `GetPresets()` -- a synthetic "Preferred Words"
 * `ReleaseTitleSpecification` preset PLUS every condition from every
 * EXISTING saved CustomFormat, cloned and renamed `"{format.Name}:
 * {condition.Name}"`, filtered to presets whose OWN implementation matches
 * the schema entry being built (`x.GetType().Name == item.Implementation`).
 */

export interface CustomFormatControllerOptions {
  formatService: CustomFormatService;
}

/** Ported from `SharedValidator.RuleFor(c => c.Name).NotEmpty()` + `.Must(unique-ignoring-self)`. */
function validateName(
  resource: CustomFormatResource,
  formatService: CustomFormatService
): ValidationFailure[] {
  if (!resource.name || resource.name.trim() === "") {
    return [{ propertyName: "name", errorMessage: "'Name' must not be empty." }];
  }

  const duplicate = formatService
    .all()
    .some((f) => f.name === resource.name && f.id !== resource.id);
  if (duplicate) {
    return [{ propertyName: "name", errorMessage: "Must be unique." }];
  }

  return [];
}

/** Ported from `SharedValidator.RuleFor(c => c.Specifications).NotEmpty()` + the `RuleFor(c => c).Custom(...)` block. */
function validateSpecificationsPresent(resource: CustomFormatResource): ValidationFailure[] {
  const errors: ValidationFailure[] = [];
  const specifications = resource.specifications ?? [];

  if (specifications.length === 0) {
    errors.push({
      propertyName: "specifications",
      errorMessage: "'Specifications' must not be empty.",
    });
  }

  // Ported: the Custom() rule below is NOT gated on the NotEmpty() rule
  // above having passed -- FluentValidation runs every RuleFor
  // independently by default (no Cascade(CascadeMode.Stop) on this
  // controller's SharedValidator), so "Must contain at least one Condition"
  // can co-occur with "'Specifications' must not be empty." for an empty
  // array. Preserved as-is.
  if (specifications.length === 0) {
    errors.push({ propertyName: "", errorMessage: "Must contain at least one Condition" });
  }

  if (specifications.some((s) => !s.name || s.name.trim() === "")) {
    errors.push({
      propertyName: "",
      errorMessage: "Condition name(s) cannot be empty or consist of only spaces",
    });
  }

  return errors;
}

/** Ported from `CustomFormatController.Validate(CustomFormat definition)` + `VerifyValidationResult` -- settings-level validation for each condition, run AFTER the shared resource-level validator (see module doc comment's two-layer note). */
function validateSpecifications(model: CustomFormat): void {
  for (const spec of model.specifications) {
    const result = spec.validate();
    if (!result.isValid) {
      throw new ValidationException(
        result.errors.map((e) => ({ propertyName: e.propertyName, errorMessage: e.errorMessage }))
      );
    }
  }
}

/** Ported from the real `[JsonIgnore(Condition = JsonIgnoreCondition.Never)]` override on `CustomFormatResource.Id` -- see `CustomFormatResource.ts`'s doc comment: this resource always serializes `id`, even 0, unlike every sibling resource `restController()`'s built-in `stripDefaultId()` otherwise applies unconditionally. */
function alwaysIncludeId<T extends { id: number }>(resource: Omit<T, "id"> | T): T {
  return "id" in resource ? resource : ({ ...resource, id: 0 } as T);
}

/** Ported from `GetPresets()`: "Preferred Words" synthetic preset + every existing CustomFormat's own conditions, cloned and renamed. */
function getPresets(formatService: CustomFormatService): CustomFormatSpecificationSchema[] {
  const presets: CustomFormatSpecificationSchema[] = [];

  const preferredWords = new ReleaseTitleSpecification();
  preferredWords.name = "Preferred Words";
  preferredWords.value = String.raw`\b(SPARKS|Framestor)\b`;
  presets.push(specificationToSchema(preferredWords));

  for (const format of formatService.all()) {
    for (const condition of format.specifications) {
      const preset = condition.clone();
      preset.name = `${format.name}: ${preset.name}`;
      presets.push(specificationToSchema(preset));
    }
  }

  return presets;
}

export function customFormatController(options: CustomFormatControllerOptions): Router {
  const { formatService } = options;

  const sharedValidator: ResourceValidator<CustomFormatResource> = (resource) => [
    ...validateName(resource, formatService),
    ...validateSpecificationsPresent(resource),
  ];

  const innerRouter = restController<CustomFormatResource>({
    getAll: () => formatService.all().map((model) => customFormatToResource(model)),
    getById: (id) => customFormatToResource(formatService.getById(id)),
    create: (resource) => {
      const model = customFormatToModel(resource);
      validateSpecifications(model);
      return customFormatToResource(formatService.insert(model));
    },
    update: (resource) => {
      const model = customFormatToModel(resource);
      validateSpecifications(model);
      formatService.update(model);
      return customFormatToResource(model);
    },
    delete: (id) => {
      formatService.delete(id);
    },
    sharedValidator,
  });

  const router = Router();

  // Every response from restController() (mounted below) runs through
  // stripDefaultId() -- re-add id:0 for CustomFormat specifically, see
  // `alwaysIncludeId()`'s doc comment. Mounted on the OUTER router, before
  // both `/schema` and the inner CRUD router, so it wraps every response
  // from either.
  router.use((_req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (Array.isArray(body)) {
        return originalJson(body.map((item) => alwaysIncludeId(item as { id: number })));
      }
      if (body && typeof body === "object") {
        return originalJson(alwaysIncludeId(body as { id: number }));
      }
      return originalJson(body);
    }) as Response["json"];
    next();
  });

  // ---- GET /schema -- mounted BEFORE the inner restController() router's
  // own `GET /:id` (see rest/RestController.ts), which would otherwise
  // greedily match "/schema" as `:id === "schema"` first (Express matches
  // routes in registration order across routers mounted at the same
  // prefix) -- the exact same ordering hazard `ProviderControllerBase.ts`'s
  // own module doc comment calls out for its `GET /schema`/`GET /:id` pair
  // ("Mounted BEFORE '/:id' so Express doesn't treat 'schema' as an :id
  // value"), reproduced here for this controller's own custom route since
  // `restController()` has no built-in `/schema` concept to order
  // correctly on this module's behalf.
  router.get("/schema", (_req: Request, res: Response, next: NextFunction) => {
    try {
      const presets = getPresets(formatService);

      // Ported: `_specifications.OrderBy(x => x.Order)` -- sort the LIVE
      // specification instances by their own `order` field (declared on
      // `ICustomFormatSpecification`, e.g. `ReleaseTitleSpecification.order
      // === 1`, `SizeSpecification.order === 8`) BEFORE mapping to the wire
      // schema shape, since `CustomFormatSpecificationSchema` itself has no
      // `order` field to sort by afterwards (matching the real C#
      // `CustomFormatSpecificationSchema` DTO, which also drops `Order`).
      const schema = [...allSpecificationDefaults()]
        .sort((a, b) => a.order - b.order)
        .map(specificationToSchema);

      for (const item of schema) {
        item.presets = presets.filter((p) => p.implementation === item.implementation);
      }

      res.json(schema);
    } catch (err) {
      next(err);
    }
  });

  router.use(innerRouter);

  return router;
}
