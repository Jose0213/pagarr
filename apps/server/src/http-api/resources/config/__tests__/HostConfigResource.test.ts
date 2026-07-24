import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigFileProvider } from "../../../../config/configFileProvider.js";
import { ConfigService } from "../../../../config/configService.js";
import { ConfigRepository } from "../../../../config/configRepository.js";
import { InMemoryKeyValueRepository } from "../../../../config/keyValueRepository.js";
import type { IUserService } from "../../../../authentication/UserService.js";
import { createUser, type User } from "../../../../authentication/User.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { hostConfigController } from "../HostConfigResource.js";

let tempDir: string;
let configPath: string;
let certPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pagarr-host-config-test-"));
  configPath = join(tempDir, "config.json");
  certPath = join(tempDir, "cert.pfx");
  writeFileSync(certPath, "fake cert bytes");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

class FakeUserService implements IUserService {
  private user: User | undefined;

  add(username: string, password: string): User {
    this.user = createUser({ id: 1, username, password });
    return this.user;
  }
  update(user: User): User {
    this.user = user;
    return user;
  }
  upsert(username: string, password: string): User {
    if (!this.user) {
      return this.add(username, password);
    }
    this.user.username = username.toLowerCase();
    this.user.password = password;
    return this.user;
  }
  findUser(): User | undefined {
    return this.user;
  }
  findUserByCredentials(): User | undefined {
    return undefined;
  }
  findUserByIdentifier(): User | undefined {
    return undefined;
  }
}

function makeApp() {
  const configFileProvider = new ConfigFileProvider(configPath);
  const kv = new InMemoryKeyValueRepository();
  const repository = new ConfigRepository(kv);
  const configService = new ConfigService(repository);
  const userService = new FakeUserService();

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/config/host",
    hostConfigController(configFileProvider, configService, userService)
  );
  app.use(readarrErrorPipeline());

  return { app, configFileProvider, configService, userService };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    bindAddress: "*",
    port: 8787,
    sslPort: 6868,
    enableSsl: false,
    launchBrowser: true,
    authenticationMethod: "None",
    authenticationRequired: "Enabled",
    analyticsEnabled: true,
    username: "",
    password: "",
    passwordConfirmation: "",
    logLevel: "debug",
    consoleLogLevel: "",
    branch: "develop",
    apiKey: "abc123",
    sslCertPath: "",
    sslCertPassword: "",
    urlBase: "",
    // Ported real rule: ContainsReadarr() -- this port is named "Pagarr" but
    // the C# HostConfigController's validator literally checks for the
    // substring "readarr" (case-insensitive), unmodified, per this port's
    // "preserve faithfully" directive -- see HostConfigResource.ts's
    // hostConfigSharedValidator. Test fixture uses a real-passing value.
    instanceName: "Readarr",
    applicationUrl: "",
    updateAutomatically: false,
    updateMechanism: "BuiltIn",
    updateScriptPath: "",
    proxyEnabled: false,
    proxyType: "Http",
    proxyHostname: "",
    proxyPort: 8080,
    proxyUsername: "",
    proxyPassword: "",
    proxyBypassFilter: "",
    proxyBypassLocalAddresses: true,
    certificateValidation: "Enabled",
    backupFolder: "Backups",
    backupInterval: 7,
    backupRetention: 28,
    trustCgnatIpAddresses: false,
    ...overrides,
  };
}

describe("hostConfigController", () => {
  it("GET / returns defaults with blank username/password/passwordConfirmation", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/host");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.bindAddress).toBe("*");
    expect(res.body.username).toBe("");
    expect(res.body.password).toBe("");
    expect(res.body.passwordConfirmation).toBe("");
  });

  it("GET / stamps username/password from IUserService, always blanks passwordConfirmation", async () => {
    const { app, userService } = makeApp();
    userService.upsert("admin", "hashed-pw");

    const res = await request(app).get("/api/v1/config/host");

    expect(res.body.username).toBe("admin");
    expect(res.body.password).toBe("hashed-pw");
    expect(res.body.passwordConfirmation).toBe("");
  });

  it("PUT persists to both stores and re-fetches", async () => {
    const { app, configFileProvider, configService } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(validBody({ branch: "main", backupRetention: 14 }));

    expect(res.status).toBe(202);
    expect(configFileProvider.branch).toBe("main");
    expect(configService.backupRetention).toBe(14);
  });

  it("PUT upserts the user when username+password are both non-empty", async () => {
    const { app, userService } = makeApp();

    await request(app)
      .put("/api/v1/config/host/1")
      .send(
        validBody({
          authenticationMethod: "Basic",
          username: "zay",
          password: "secret",
          passwordConfirmation: "secret",
        })
      );

    expect(userService.findUser()?.username).toBe("zay");
  });

  it("PUT rejects an invalid bindAddress (not '*', not 'localhost', not a valid IP)", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(validBody({ bindAddress: "not-an-ip" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([{ propertyName: "bindAddress", errorMessage: "Invalid IP Address" }])
    );
  });

  it("PUT rejects an invalid port", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(validBody({ port: 100 })); // <=1024 and not 80/443

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([{ propertyName: "port", errorMessage: "Invalid Port" }])
    );
  });

  it("PUT requires username/password when authenticationMethod is Basic", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(validBody({ authenticationMethod: "Basic", username: "", password: "" }));

    expect(res.status).toBe(400);
    const failures = res.body as { propertyName: string }[];
    const names = failures.map((f) => f.propertyName);
    expect(names).toEqual(expect.arrayContaining(["username", "password"]));
  });

  it("PUT rejects a passwordConfirmation mismatch for a new user", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(
        validBody({
          authenticationMethod: "Basic",
          username: "zay",
          password: "secret",
          passwordConfirmation: "different",
        })
      );

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { propertyName: "passwordConfirmation", errorMessage: "Must match Password" },
      ])
    );
  });

  it("PUT allows a stale passwordConfirmation when password matches the existing stored hash", async () => {
    const { app, userService } = makeApp();
    userService.upsert("zay", "stored-hash");

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(
        validBody({
          authenticationMethod: "Basic",
          username: "zay",
          password: "stored-hash",
          passwordConfirmation: "irrelevant",
        })
      );

    expect(res.status).toBe(202);
  });

  it("PUT requires sslCertPath to exist on disk when enableSsl is true", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(
        validBody({ enableSsl: true, sslPort: 6868, port: 8787, sslCertPath: "/does/not/exist" })
      );

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([{ propertyName: "sslCertPath", errorMessage: "File does not exist" }])
    );
  });

  it("PUT accepts an existing sslCertPath file when enableSsl is true and sslPort differs from port", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(validBody({ enableSsl: true, sslPort: 6868, port: 8787, sslCertPath: certPath }));

    expect(res.status).toBe(202);
  });

  it("PUT rejects sslPort equal to port when enableSsl is true", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(validBody({ enableSsl: true, sslPort: 8787, port: 8787, sslCertPath: certPath }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([{ propertyName: "sslPort", errorMessage: "Should not equal Port" }])
    );
  });

  it("PUT rejects backupInterval/backupRetention out of range", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/host/1")
      .send(validBody({ backupInterval: 0, backupRetention: 200 }));

    expect(res.status).toBe(400);
    const failures = res.body as { propertyName: string }[];
    const names = failures.map((f) => f.propertyName);
    expect(names).toEqual(expect.arrayContaining(["backupInterval", "backupRetention"]));
  });
});
