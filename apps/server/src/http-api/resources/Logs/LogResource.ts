import type { RestResource } from "../../rest/RestResource.js";
import type { Log } from "../../../instrumentation/log.js";

/**
 * Ported from Readarr.Api.V1/Logs/LogResource.cs.
 *
 * `Level` is lower-cased on the way out (`model.Level.ToLowerInvariant()`)
 * -- ported literally. Unlike `Time`, `Exception`/`ExceptionType`/
 * `Message`/`Logger`/`Method` are plain strings already matching this
 * port's `Log` domain model shape (instrumentation/log.ts) with no enum or
 * date-object conversion needed. NOTE: the real `LogResource` also
 * declares a `Method` property, but `LogResourceMapper.ToResource` never
 * actually assigns it (a real, observable gap in the C# source itself --
 * `Method` is always the JSON default/null on every real `/log` response)
 * -- ported faithfully: `method` is part of this wire interface for shape
 * fidelity but `logToResource` below never sets it either (`method` stays
 * `undefined`, matching "the JSON property is present in the class but the
 * mapper forgot to populate it").
 */
export interface LogResource extends RestResource {
  time: string;
  exception: string | null;
  exceptionType: string | null;
  level: string;
  logger: string;
  message: string;
  method?: string;
}

export const LOG_RESOURCE_NAME = "log";

/** Ported from `LogResourceMapper.ToResource(this Log model)`. See interface doc comment re: `Method` never being set. */
export function logToResource(model: Log): LogResource {
  return {
    id: model.id,
    time: model.time,
    exception: model.exception,
    exceptionType: model.exceptionType,
    level: model.level.toLowerCase(),
    logger: model.logger,
    message: model.message,
  };
}
