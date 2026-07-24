import type { RestResource } from "../../rest/RestResource.js";
import type { HealthCheck } from "../../../health-check/healthCheck.js";
import { healthCheckSourceName, HealthCheckResult } from "../../../health-check/healthCheck.js";
import { buildEnumWireNames, enumWireName } from "../../rest/enumWireName.js";

/**
 * Ported from Readarr.Api.V1/Health/HealthResource.cs.
 *
 * `Type` (C#'s `HealthCheckResult` enum) serializes as a camelCase string
 * on the real wire (STJson's global `JsonStringEnumConverter` -- see
 * `enumWireName.ts`'s doc comment), not a numeric ordinal.
 */
export interface HealthResource extends RestResource {
  source: string;
  type: string;
  message: string | null;
  wikiUrl: string | null;
}

export const HEALTH_RESOURCE_NAME = "health";

const HEALTH_CHECK_RESULT_NAMES = buildEnumWireNames(HealthCheckResult);

/** Ported from `HealthResourceMapper.ToResource(this HealthCheck model)`. */
export function healthCheckToResource(model: HealthCheck): HealthResource {
  return {
    id: model.id,
    source: healthCheckSourceName(model.source),
    type: enumWireName(HEALTH_CHECK_RESULT_NAMES, model.type),
    message: model.message,
    wikiUrl: model.wikiUrl?.fullUri ?? null,
  };
}

/** Ported from `HealthResourceMapper.ToResource(this IEnumerable<HealthCheck> models)`. */
export function healthChecksToResource(models: HealthCheck[]): HealthResource[] {
  return models.map(healthCheckToResource);
}
