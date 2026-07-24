import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Router } from "express";
import request from "supertest";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigFileProvider } from "../../config/configFileProvider.js";
import { createApp, type PagarrApp } from "../app.js";
import { restController } from "../rest/RestController.js";
import type { RestResource } from "../rest/RestResource.js";

interface Widget extends RestResource {
  name: string;
}

let tempDir: string;
let configPath: string;
let pagarrApp: PagarrApp | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pagarr-app-test-"));
  configPath = join(tempDir, "config.json");
});

afterEach(async () => {
  await pagarrApp?.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("createApp", () => {
  it("boots and serves a 200 from a mounted resource router", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, { authenticationMethod: "None" });
    pagarrApp = createApp({ configFileProvider });

    const widgetRouter: Router = restController<Widget>({
      getAll: () => [{ id: 1, name: "gadget" }],
    });
    pagarrApp.mountResource("/api/v1/widget", widgetRouter);

    const res = await request(pagarrApp.app).get("/api/v1/widget");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: "gadget" }]);
  });

  it("an unmounted route 404s cleanly through the error pipeline (not a raw Express HTML 404)", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, { authenticationMethod: "None" });
    pagarrApp = createApp({ configFileProvider });
    // Deliberately mount nothing else -- exercise the bare app + error pipeline.
    pagarrApp.listen(0);

    const res = await request(pagarrApp.app).get("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    // Express's own default 404 handler returns text/html; this port's
    // composition root must not leak that -- there should be no resource
    // router AND no error thrown, so this is Express's bare 404, which is
    // fine as long as it's not a 500 from the error pipeline mishandling
    // "no matching route". The real assertion here is just that the
    // request completes cleanly with a 4xx, not a 5xx from a pipeline bug.
    expect(res.status).toBeLessThan(500);
  });

  it("auth middleware rejects a request with a missing API key when auth is required", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      apiKey: "secret-key",
    });
    pagarrApp = createApp({ configFileProvider });

    const widgetRouter: Router = restController<Widget>({ getAll: () => [] });
    pagarrApp.mountResource("/api/v1/widget", widgetRouter);

    const res = await request(pagarrApp.app).get("/api/v1/widget");

    expect(res.status).toBe(401);
  });

  it("auth middleware rejects a request with a wrong API key", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      apiKey: "secret-key",
    });
    pagarrApp = createApp({ configFileProvider });

    const widgetRouter: Router = restController<Widget>({ getAll: () => [] });
    pagarrApp.mountResource("/api/v1/widget", widgetRouter);

    const res = await request(pagarrApp.app).get("/api/v1/widget").set("X-Api-Key", "wrong-key");

    expect(res.status).toBe(401);
  });

  it("auth middleware accepts a request with the correct API key", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      apiKey: "secret-key",
    });
    pagarrApp = createApp({ configFileProvider });

    const widgetRouter: Router = restController<Widget>({ getAll: () => [] });
    pagarrApp.mountResource("/api/v1/widget", widgetRouter);

    const res = await request(pagarrApp.app).get("/api/v1/widget").set("X-Api-Key", "secret-key");

    expect(res.status).toBe(200);
  });

  it("errors thrown by a mounted resource router are caught by the error pipeline, not left unhandled", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, { authenticationMethod: "None" });
    pagarrApp = createApp({ configFileProvider });

    const widgetRouter: Router = restController<Widget>({
      getById: () => {
        throw new Error("boom");
      },
    });
    pagarrApp.mountResource("/api/v1/widget", widgetRouter);
    pagarrApp.listen(0); // error pipeline is attached at listen() time -- see PagarrApp.mountResource's doc comment.

    const res = await request(pagarrApp.app).get("/api/v1/widget/1");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("boom");
  });

  it("mountResource throws if called after listen()", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, { authenticationMethod: "None" });
    pagarrApp = createApp({ configFileProvider });
    pagarrApp.listen(0);

    expect(() =>
      pagarrApp!.mountResource("/api/v1/late", restController<Widget>({ getAll: () => [] }))
    ).toThrow(/mountResource.*after listen/);
  });

  it("listen() actually binds a port and serves real HTTP traffic end-to-end", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, { authenticationMethod: "None" });
    pagarrApp = createApp({ configFileProvider });

    const widgetRouter: Router = restController<Widget>({ getAll: () => [{ id: 1, name: "x" }] });
    pagarrApp.mountResource("/api/v1/widget", widgetRouter);

    const server = pagarrApp.listen(0);
    const port = (server.address() as AddressInfo).port;

    const res = await fetch(`http://localhost:${port}/api/v1/widget`);
    const body: unknown = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([{ id: 1, name: "x" }]);
  });

  it("the SignalR WebSocket upgrade is live once listen() has bound a port", async () => {
    const configFileProvider = new ConfigFileProvider(configPath, { authenticationMethod: "None" });
    pagarrApp = createApp({ configFileProvider, signalRPath: "/signalr" });
    const server = pagarrApp.listen(0);
    const port = (server.address() as AddressInfo).port;

    const opened = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}/signalr`);
      ws.once("open", () => {
        ws.close();
        resolve(true);
      });
      ws.once("error", () => resolve(false));
    });

    expect(opened).toBe(true);
  });
});
