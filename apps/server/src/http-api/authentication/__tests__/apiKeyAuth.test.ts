import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigFileProvider } from "../../../config/configFileProvider.js";
import { apiKeyAuthMiddleware, createAuthMiddleware } from "../apiKeyAuth.js";

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pagarr-authtest-"));
  configPath = join(tempDir, "config.json");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function buildApp(configFileProvider: ConfigFileProvider) {
  const app = express();
  app.use(createAuthMiddleware(configFileProvider));
  app.get("/api/v1/thing", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createAuthMiddleware", () => {
  it("AuthenticationType.None -- never checks, always passes", async () => {
    const provider = new ConfigFileProvider(configPath, { authenticationMethod: "None" });
    const app = buildApp(provider);

    const res = await request(app).get("/api/v1/thing");

    expect(res.status).toBe(200);
  });

  it("rejects a request with no API key when auth is required (matches the app's smoke-test requirement)", async () => {
    const provider = new ConfigFileProvider(configPath, { authenticationMethod: "Basic" });
    const app = buildApp(provider);

    const res = await request(app).get("/api/v1/thing");

    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong API key", async () => {
    const provider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      apiKey: "correct-key",
    });
    const app = buildApp(provider);

    const res = await request(app).get("/api/v1/thing").set("X-Api-Key", "wrong-key");

    expect(res.status).toBe(401);
  });

  it("accepts the correct key via the X-Api-Key header", async () => {
    const provider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      apiKey: "correct-key",
    });
    const app = buildApp(provider);

    const res = await request(app).get("/api/v1/thing").set("X-Api-Key", "correct-key");

    expect(res.status).toBe(200);
  });

  it("accepts the correct key via the apikey query param", async () => {
    const provider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      apiKey: "correct-key",
    });
    const app = buildApp(provider);

    const res = await request(app).get("/api/v1/thing?apikey=correct-key");

    expect(res.status).toBe(200);
  });

  it("accepts the correct key via Authorization: Bearer", async () => {
    const provider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      apiKey: "correct-key",
    });
    const app = buildApp(provider);

    const res = await request(app).get("/api/v1/thing").set("Authorization", "Bearer correct-key");

    expect(res.status).toBe(200);
  });

  it("query param takes precedence over header, matching ParseApiKey's order", async () => {
    const provider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      apiKey: "correct-key",
    });
    const app = buildApp(provider);

    // Query param is correct, header is wrong -- query wins per real ParseApiKey order.
    const res = await request(app)
      .get("/api/v1/thing?apikey=correct-key")
      .set("X-Api-Key", "wrong-key");

    expect(res.status).toBe(200);
  });

  it("DisabledForLocalAddresses bypasses the check entirely for a loopback remote address", async () => {
    const provider = new ConfigFileProvider(configPath, {
      authenticationMethod: "Basic",
      authenticationRequired: "DisabledForLocalAddresses",
      apiKey: "correct-key",
    });
    const app = buildApp(provider);

    // supertest against an in-process app connects via loopback.
    const res = await request(app).get("/api/v1/thing");

    expect(res.status).toBe(200);
  });
});

describe("apiKeyAuthMiddleware", () => {
  it("401s with no body on missing key (matches HandleChallengeAsync's bare 401)", async () => {
    const provider = new ConfigFileProvider(configPath, { apiKey: "k" });
    const app = express();
    app.use(apiKeyAuthMiddleware(provider));
    app.get("/x", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/x");

    expect(res.status).toBe(401);
    expect(res.text).toBe("");
  });
});
