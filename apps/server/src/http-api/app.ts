import { createServer, type Server as HttpServer } from "node:http";
import express, { type Express, type Router } from "express";
import type { ConfigFileProvider } from "../config/configFileProvider.js";
import { createAuthMiddleware } from "./authentication/apiKeyAuth.js";
import {
  readarrErrorPipeline,
  type ErrorPipelineLogger,
} from "./error-management/ReadarrErrorPipeline.js";
import {
  SignalRBroadcaster,
  type SignalRBroadcasterOptions,
} from "./signalr/SignalRBroadcaster.js";

/**
 * `apps/server/src/http-api/app.ts` -- new file, no direct 1:1 C# source.
 *
 * `NzbDrone.Host/Startup.cs` is ASP.NET-specific DI/middleware-pipeline
 * wiring (`ConfigureServices`/`Configure`, authentication scheme
 * registration, MVC controller discovery via assembly scanning, SignalR hub
 * mapping, static-file serving) -- none of that has a line-for-line Express
 * analog worth preserving 1:1 (per this task's brief: "design the smallest
 * reasonable TS-native equivalent that satisfies the same real USE this
 * codebase's future controllers will need"). This file is that equivalent:
 * a `createApp()` factory building the reusable Express + WebSocket
 * scaffold every Phase 5 resource-controller module mounts its own router
 * onto, with NO resource routes registered here (no Books, no Indexers --
 * explicitly out of scope per this task's brief; that's the next dispatch).
 *
 * ## What's mounted, in order (order matters for Express middleware)
 *
 *   1. `express.json()` -- JSON body-parsing for every route (ported spirit
 *      of ASP.NET's automatic `[FromBody]` model binding -- ProviderControllerBase.ts
 *      and RestController.ts both assume `req.body` is already the parsed
 *      resource, not a raw string/stream).
 *   2. The auth middleware (`createAuthMiddleware`, see
 *      authentication/apiKeyAuth.ts) -- ported from the real
 *      `ApiKeyAuthenticationHandler`/`UiAuthorizationHandler` combination,
 *      gated by `ConfigFileProvider.authenticationMethod`/
 *      `.authenticationRequired`. Mounted before any resource router so
 *      every mounted route is protected uniformly (matches ASP.NET's
 *      `UseAuthentication()`/`UseAuthorization()` running ahead of MVC
 *      routing in the real `Startup.cs` pipeline).
 *   3. Resource routers -- NOT mounted by this file. `mountResource(path,
 *      router)` is exposed for Phase 5 sibling agents to call after
 *      `createApp()` returns (e.g. `app.mountResource("/api/v1/book",
 *      bookRouter)`).
 *   4. The error-handling middleware (`readarrErrorPipeline`, see
 *      error-management/ReadarrErrorPipeline.ts) -- mounted LAST, since
 *      Express only recognizes a 4-arg `(err, req, res, next)` function as
 *      an error handler if it's registered after everything that might
 *      throw/call `next(err)`. This is the direct equivalent of ASP.NET's
 *      `app.UseExceptionHandler(...)` being registered early in the C#
 *      pipeline (ASP.NET's exception-handler middleware wraps everything
 *      downstream of it, which functionally means "run last" in Express
 *      terms despite being declared first in `Startup.cs` -- the two
 *      frameworks' registration-order semantics for error handling are
 *      inverted, and this file's ordering is correct FOR EXPRESS, not a
 *      literal transcription of the C# file's line order).
 *
 * ## SignalR / WebSocket wiring
 *
 * `SignalRBroadcaster` (signalr/SignalRBroadcaster.ts) needs a live
 * `node:http.Server` to attach its `WebSocketServer` to (both `ws` and
 * ASP.NET SignalR share this same requirement -- a WebSocket upgrade
 * happens on the same TCP listener as HTTP). `createApp()` therefore
 * constructs the `http.Server` itself (via `createServer(app)`) rather than
 * letting a caller's own `app.listen(...)` create one implicitly, so the
 * broadcaster can be wired up before `listen()` is ever called. `listen(port)`
 * is exposed as a thin wrapper over that same server instance.
 */

export interface CreateAppOptions {
  configFileProvider: ConfigFileProvider;
  /** Version string included in the SignalR `version` welcome broadcast -- see SignalRBroadcaster.ts. Optional; omitted entirely if not supplied. */
  version?: string;
  /** WebSocket upgrade path for the SignalR-equivalent broadcaster. Ported spirit of SignalR's default hub route (`/signalr` in the real Readarr `Startup.cs` hub mapping). */
  signalRPath?: string;
  logger?: ErrorPipelineLogger;
}

export interface PagarrApp {
  app: Express;
  server: HttpServer;
  signalRBroadcaster: SignalRBroadcaster;
  /**
   * Mounts a resource router at the given base path. The explicit hook
   * Phase 5 sibling resource-controller agents call to register their own
   * `restController()`/`providerControllerBase()`-built routers (e.g.
   * `app.mountResource("/api/v1/book", bookRouter)`) -- this function's
   * only job is providing that scaffold; no resource routes are registered
   * by this module itself (see file doc comment).
   *
   * IMPORTANT for callers: `mountResource` must be called BEFORE
   * `listen()` -- the error-handling middleware is attached lazily, at
   * `listen()` time, specifically so every resource router mounted before
   * that point sits ahead of it in the Express middleware chain (see file
   * doc comment's ordering note). Mounting after `listen()` has been
   * called still works for routing purposes but means errors thrown by
   * that late-mounted router will NOT be caught by `readarrErrorPipeline`
   * -- always mount all resource routers first, then call `listen()` once.
   */
  mountResource: (path: string, router: Router) => void;
  /** Starts listening on the given port. Attaches the error-handling middleware first -- see `mountResource`'s doc comment for why call order matters. Returns the same `server` this object already exposes, for convenience. */
  listen: (port: number) => HttpServer;
  /** Closes the HTTP server and the SignalR broadcaster's WebSocket server. Not a C# concept (ASP.NET's host owns its own shutdown) -- added for tests and graceful shutdown callers. */
  close: () => Promise<void>;
}

export function createApp(options: CreateAppOptions): PagarrApp {
  const { configFileProvider, version, signalRPath, logger } = options;

  const app = express();
  const server = createServer(app);

  const signalRBroadcasterOptions: SignalRBroadcasterOptions = {};
  if (version !== undefined) {
    signalRBroadcasterOptions.version = version;
  }
  const signalRBroadcaster = new SignalRBroadcaster(
    server,
    signalRPath ?? "/signalr",
    signalRBroadcasterOptions
  );

  app.use(express.json());
  app.use(createAuthMiddleware(configFileProvider));

  let errorPipelineMounted = false;

  function mountResource(path: string, router: Router): void {
    if (errorPipelineMounted) {
      throw new Error(
        `mountResource("${path}") called after listen() -- resource routers must be mounted before listen() so the error pipeline sits after them. See PagarrApp.mountResource's doc comment.`
      );
    }
    app.use(path, router);
  }

  function listen(port: number): HttpServer {
    if (!errorPipelineMounted) {
      app.use(readarrErrorPipeline(logger));
      errorPipelineMounted = true;
    }

    server.listen(port);
    return server;
  }

  function close(): Promise<void> {
    signalRBroadcaster.close();

    // Tolerate a server that was never started -- a caller (or a test that
    // exercises `app` directly via supertest's own ephemeral binding
    // instead of calling `listen()`) may legitimately never have called
    // `listen()` at all. Node's `http.Server.close()` calls its callback
    // with `ERR_SERVER_NOT_RUNNING` in that case; that's not a real error
    // for this method's purpose ("make sure nothing is left listening"),
    // so it's swallowed rather than rejecting.
    if (!server.listening) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err && (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  return { app, server, signalRBroadcaster, mountResource, listen, close };
}
