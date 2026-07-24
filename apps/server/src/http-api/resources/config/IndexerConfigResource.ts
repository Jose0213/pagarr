import type { IConfigService } from "../../../config/configService.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import type { RestResource } from "../../rest/RestResource.js";
import { configController } from "./configControllerBase.js";
import type { Router } from "express";

/**
 * Ported from Readarr.Api.V1/Config/{IndexerConfigResource,
 * IndexerConfigController}.cs. Mount path: `/api/v1/config/indexer`.
 */
export interface IndexerConfigResource extends RestResource {
  minimumAge: number;
  maximumSize: number;
  retention: number;
  rssSyncInterval: number;
}

export function toIndexerConfigResource(model: IConfigService): Omit<IndexerConfigResource, "id"> {
  return {
    minimumAge: model.minimumAge,
    maximumSize: model.maximumSize,
    retention: model.retention,
    rssSyncInterval: model.rssSyncInterval,
  };
}

/** camelCase keys matching `IConfigService`'s own property names -- see DownloadClientConfigResource.ts's doc comment on why this differs from the real C# reflection's PascalCase. */
function toDictionary(resource: IndexerConfigResource): Record<string, unknown> {
  return {
    minimumAge: resource.minimumAge,
    maximumSize: resource.maximumSize,
    retention: resource.retention,
    rssSyncInterval: resource.rssSyncInterval,
  };
}

/** Ported from `RuleBuilderExtensions.IsValidRssSyncInterval` / `RssSyncIntervalValidator`: null/0 valid (0 = disabled), otherwise must be 10-120 inclusive. */
function isValidRssSyncInterval(value: number): boolean {
  if (value === 0) {
    return true;
  }
  return value >= 10 && value <= 120;
}

/** Ported from IndexerConfigController's ctor SharedValidator rules. */
export function indexerConfigSharedValidator(resource: IndexerConfigResource): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (resource.minimumAge < 0) {
    failures.push({
      propertyName: "minimumAge",
      errorMessage: "'Minimum Age' must be greater than or equal to '0'.",
    });
  }

  if (resource.maximumSize < 0) {
    failures.push({
      propertyName: "maximumSize",
      errorMessage: "'Maximum Size' must be greater than or equal to '0'.",
    });
  }

  if (resource.retention < 0) {
    failures.push({
      propertyName: "retention",
      errorMessage: "'Retention' must be greater than or equal to '0'.",
    });
  }

  if (!isValidRssSyncInterval(resource.rssSyncInterval)) {
    failures.push({
      propertyName: "rssSyncInterval",
      errorMessage: "Must be between 10 and 120 or 0 to disable",
    });
  }

  return failures;
}

export function indexerConfigController(configService: IConfigService): Router {
  return configController<IndexerConfigResource>({
    configService,
    toResource: toIndexerConfigResource,
    toDictionary,
    sharedValidator: indexerConfigSharedValidator,
  });
}
