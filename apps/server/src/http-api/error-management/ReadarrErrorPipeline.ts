import type { ErrorRequestHandler } from "express";
import { ModelConflictException, ModelNotFoundException } from "../../db/errors.js";
import { NzbDroneClientException } from "../../exceptions/NzbDroneClientException.js";
import { ValidationException } from "../../validation/validationResult.js";
import { ApiException } from "../exceptions/ApiException.js";
import { ErrorModel } from "./ErrorModel.js";

/**
 * Ported from Readarr.Http/ErrorManagement/ReadarrErrorPipeline.cs.
 *
 * C#'s pipeline is registered as ASP.NET's `IExceptionHandlerPathFeature`
 * catch-all (`app.UseExceptionHandler(...)`), reading the caught exception
 * off `context.Features.Get<IExceptionHandlerPathFeature>().Error`. This
 * port is the direct Express equivalent: a 4-arg error-handling middleware
 * (`(err, req, res, next)`), mounted LAST by the app bootstrap
 * (see ../app.ts) -- Express requires exactly this arity + position to be
 * recognized as an error handler at all.
 *
 * ## Exception-type -> status-code mapping (ported in the exact real order)
 *
 *   1. `ApiException` (this module's own `BadRequestException`/
 *      `NotFoundException`/`MethodNotAllowedException`/
 *      `UnsupportedMediaTypeException`, or any future subclass) -> its own
 *      `.statusCode`, body is `new ErrorModel(apiException)` (message +
 *      content, no description -- matches C#'s `new ErrorModel(apiException)`
 *      ctor overload, which never sets `Description`).
 *   2. `ValidationException` (this port's already-ported
 *      `validation/validationResult.ts` one -- the real C# branch checks
 *      FluentValidation's `ValidationException`, whose `.Errors` this port's
 *      `ValidationException.errors` is the direct analog of) -> HTTP 400,
 *      body is the RAW errors array, NOT wrapped in an ErrorModel (ported
 *      literally: `await response.WriteAsync(STJson.ToJson(validationException.Errors));`
 *      then an early `return` -- no ErrorModel.WriteToResponse call for this
 *      branch at all).
 *   3. `NzbDroneClientException` (apps/server/src/exceptions/, Phase 4 Wave 1,
 *      already ported) -> its own `.statusCode`.
 *   4. `ModelNotFoundException` (db/errors.ts, already ported as part of
 *      Phase 0 Datastore) -> HTTP 404.
 *   5. `ModelConflictException` (db/errors.ts, already ported) -> HTTP 409.
 *   6. A `node:sqlite` constraint-violation error on PUT/POST -> HTTP 409.
 *      See `isSqliteConstraintError()` below for the detection mechanism
 *      and why it's NOT the C# source's fragile message-string match.
 *   7. Anything else -> HTTP 500 (the ErrorModel default), `message`/
 *      `description` populated from the error's own message/stack (the
 *      closest analog to C#'s `exception?.Message`/`exception?.ToString()`
 *      -- a full stack trace is a reasonable "ToString()" substitute; note
 *      this is server-side-logged detail, never something a caller should
 *      render directly to an end user -- separate from this port's concern).
 *
 * ## SQLite-constraint-conflict detection: `node:sqlite`'s real error shape, not a message-string guess
 *
 * The real C# branch does `sqLiteException.Message.Contains("constraint
 * failed")` -- a fragile message-string match, callable out in this task's
 * brief as something to replace with the REAL mechanism this port's SQLite
 * binding (`node:sqlite`) actually provides. Verified directly (not
 * guessed) against a live `node:sqlite` `DatabaseSync`: a constraint
 * violation (UNIQUE, PRIMARY KEY, NOT NULL, CHECK, FOREIGN KEY -- all of
 * them) throws a plain `Error` whose `.code` is the string
 * `"ERR_SQLITE_ERROR"` and whose `.errcode` is SQLite's own *extended*
 * result code (e.g. `2067` for UNIQUE, `1555` for PRIMARY KEY, `1299` for
 * NOT NULL). Every one of SQLite's extended result codes for a constraint
 * failure shares the same *primary* result code, `SQLITE_CONSTRAINT = 19`,
 * encoded in the low byte of the extended code (`extended = primary |
 * (subcode << 8)`, per SQLite's own documented result-code layout) --
 * `errcode & 0xff === 19` is the exact, engine-provided equivalent of C#'s
 * message-sniffing, and is robust to locale/wording changes in SQLite's
 * error text (unlike the string-match this replaces). Confirmed by direct
 * `node --eval` reproduction against three distinct constraint kinds
 * (UNIQUE/PRIMARY KEY/NOT NULL) all producing `errcode & 0xff === 19` while
 * an unrelated error (`no such table`) produces `errcode === 1`
 * (`SQLITE_ERROR`, no constraint involved) -- see this task's final report
 * for the transcript.
 *
 * `node:sqlite` errors are plain `Error` instances (not a distinct
 * `SqliteError` class this port could `instanceof`-check), so detection
 * goes by property shape (`code === "ERR_SQLITE_ERROR"` + numeric
 * `errcode`) rather than a class check -- ported as `isSqliteConstraintError()`.
 */

const SQLITE_CONSTRAINT_PRIMARY_CODE = 19; // SQLITE_CONSTRAINT

interface NodeSqliteError extends Error {
  code: string;
  errcode: number;
  errstr?: string;
}

function isNodeSqliteError(err: unknown): err is NodeSqliteError {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as { code?: unknown }).code === "ERR_SQLITE_ERROR" &&
    typeof (err as { errcode?: unknown }).errcode === "number"
  );
}

/** See module doc comment's "SQLite-constraint-conflict detection" section. */
function isSqliteConstraintError(err: unknown): err is NodeSqliteError {
  return isNodeSqliteError(err) && (err.errcode & 0xff) === SQLITE_CONSTRAINT_PRIMARY_CODE;
}

/** Minimal logger surface this pipeline needs -- same `noopLogger`-by-default convention as thingi-provider/ProviderFactory.ts's `ProviderFactoryLogger` (Instrumentation/NLog not wired to this module). */
export interface ErrorPipelineLogger {
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  fatal(message: string, ...args: unknown[]): void;
}

const noopLogger: ErrorPipelineLogger = {
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

/**
 * Ported from ReadarrErrorPipeline.HandleException(HttpContext). Returns an
 * Express error-handling middleware (4-arg signature required) implementing
 * the mapping described in this module's doc comment.
 */
export function readarrErrorPipeline(
  logger: ErrorPipelineLogger = noopLogger
): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (res.headersSent) {
      // Ported spirit of ASP.NET's exception-handler middleware, which only
      // runs when the response hasn't started -- Express has no built-in
      // guard for this, so it's made explicit here to avoid a "headers
      // already sent" crash if a handler both wrote a partial response and
      // then threw.
      return;
    }

    if (err instanceof ApiException) {
      logger.warn(`API Error:\n${err.message}`);
      new ErrorModel(err).writeToResponse(res, err.statusCode);
      return;
    }

    if (err instanceof ValidationException) {
      logger.warn(`Invalid request ${err.message}`);
      res.status(400).type("application/json").json(err.errors);
      return;
    }

    if (err instanceof NzbDroneClientException) {
      new ErrorModel().writeToResponse(res, err.statusCode);
      return;
    }

    if (err instanceof ModelNotFoundException) {
      new ErrorModel().writeToResponse(res, 404);
      return;
    }

    if (err instanceof ModelConflictException) {
      new ErrorModel().writeToResponse(res, 409);
      return;
    }

    if (isNodeSqliteError(err)) {
      let statusCode = 500;

      if ((req.method === "PUT" || req.method === "POST") && isSqliteConstraintError(err)) {
        statusCode = 409;
      }

      logger.error(`[${req.method} ${req.path}] ${err.message}`);

      const errorModel = new ErrorModel();
      errorModel.message = err.message;
      errorModel.description = err.stack;
      errorModel.writeToResponse(res, statusCode);
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    const description = err instanceof Error ? err.stack : undefined;

    logger.fatal(`Request Failed. ${req.method} ${req.path}`);

    const errorModel = new ErrorModel();
    errorModel.message = message;
    errorModel.description = description;
    errorModel.writeToResponse(res, 500);
  };
}
