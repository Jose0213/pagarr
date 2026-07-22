import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigFileProvider } from "../configFileProvider.js";

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pagarr-config-test-"));
  configPath = join(tempDir, "config.json");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("ConfigFileProvider defaults", () => {
  it("returns the C#-ported default for every property when the file doesn't exist yet", () => {
    const provider = new ConfigFileProvider(configPath, {}, undefined);

    expect(provider.bindAddress).toBe("*");
    expect(provider.port).toBe(8787);
    expect(provider.sslPort).toBe(6868);
    expect(provider.enableSsl).toBe(false);
    expect(provider.launchBrowser).toBe(true);
    expect(provider.authenticationMethod).toBe("None");
    expect(provider.authenticationRequired).toBe("Enabled");
    expect(provider.analyticsEnabled).toBe(true);
    expect(provider.logLevel).toBe("debug");
    expect(provider.logSql).toBe(false);
    expect(provider.logRotate).toBe(50);
    expect(provider.filterSentryEvents).toBe(true);
    expect(provider.branch).toBe("develop");
    expect(provider.sslCertPath).toBe("");
    expect(provider.urlBase).toBe("");
    expect(provider.instanceName).toBe("Pagarr");
    expect(provider.updateAutomatically).toBe(false);
    expect(provider.updateMechanism).toBe("BuiltIn");
    expect(provider.syslogPort).toBe(514);
    expect(provider.theme).toBe("auto");
    expect(provider.trustCgnatIpAddresses).toBe(false);
  });

  it("generates a fresh API key when none is stored, and persists it", () => {
    const provider = new ConfigFileProvider(configPath);

    const apiKey = provider.apiKey;
    expect(apiKey).toMatch(/^[0-9a-f]{32}$/i);

    // Second read returns the same (persisted) key.
    expect(provider.apiKey).toBe(apiKey);

    // A brand new provider instance reading the same file sees the same key.
    const secondProvider = new ConfigFileProvider(configPath);
    expect(secondProvider.apiKey).toBe(apiKey);
  });
});

describe("ConfigFileProvider round-trip (write then read back)", () => {
  it("round-trips a boolean, number, string, and enum value through a fresh provider instance reading the same file", () => {
    const provider = new ConfigFileProvider(configPath);

    provider.setValue("port", 9898);
    provider.setValue("enableSsl", true);
    provider.setValue("instanceName", "PagarrTest");
    provider.setValue("logLevel", "trace");

    const reloaded = new ConfigFileProvider(configPath);
    expect(reloaded.port).toBe(9898);
    expect(reloaded.enableSsl).toBe(true);
    expect(reloaded.instanceName).toBe("PagarrTest");
    expect(reloaded.logLevel).toBe("trace");
  });

  it("round-trips saveConfigDictionary() writes, skipping apiKey and unchanged values", () => {
    const provider = new ConfigFileProvider(configPath);
    const originalApiKey = provider.apiKey;

    const onSaved = vi.fn();
    const provider2 = new ConfigFileProvider(configPath, {}, onSaved);

    provider2.saveConfigDictionary({
      port: 7878,
      apiKey: "attempt-to-overwrite-should-be-ignored",
      theme: "auto", // unchanged from default -- should not force a write
    });

    expect(onSaved).toHaveBeenCalledTimes(1);

    const reloaded = new ConfigFileProvider(configPath);
    expect(reloaded.port).toBe(7878);
    // apiKey write was ignored -- original persisted key is unchanged.
    expect(reloaded.apiKey).toBe(originalApiKey);
  });

  it("resetApiKey() generates and persists a new key, distinct from the old one", () => {
    const provider = new ConfigFileProvider(configPath);
    const originalKey = provider.apiKey;

    const newKey = provider.resetApiKey();
    expect(newKey).not.toBe(originalKey);
    expect(provider.apiKey).toBe(newKey);

    const reloaded = new ConfigFileProvider(configPath);
    expect(reloaded.apiKey).toBe(newKey);
  });

  it("writes valid, human-readable JSON to disk", () => {
    const provider = new ConfigFileProvider(configPath);
    provider.setValue("port", 8787);

    expect(existsSync(configPath)).toBe(true);
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.port).toBe(8787);
  });

  it("urlBase strips slashes and re-adds a single leading slash, persisting and round-tripping the normalized form", () => {
    const provider = new ConfigFileProvider(configPath);
    provider.setValue("urlBase", "/readarr/");

    expect(provider.urlBase).toBe("/readarr");

    const reloaded = new ConfigFileProvider(configPath);
    expect(reloaded.urlBase).toBe("/readarr");
  });

  it("instanceName falls back to the app default if the stored value doesn't contain the app name", () => {
    const provider = new ConfigFileProvider(configPath);
    provider.setValue("instanceName", "SomethingElseEntirely");

    expect(provider.instanceName).toBe("Pagarr");
  });
});

describe("ConfigFileProvider env overrides", () => {
  it("an env override wins over both the stored file value and the default", () => {
    const provider = new ConfigFileProvider(configPath);
    provider.setValue("port", 1111);

    const overridden = new ConfigFileProvider(configPath, { port: 2222 });
    expect(overridden.port).toBe(2222);
  });

  it("authenticationEnabled override forces Basic auth and persists it", () => {
    const provider = new ConfigFileProvider(configPath, { authenticationEnabled: true });
    expect(provider.authenticationMethod).toBe("Basic");

    const reloaded = new ConfigFileProvider(configPath);
    expect(reloaded.authenticationMethod).toBe("Basic");
  });
});

describe("ConfigFileProvider lifecycle helpers", () => {
  it("ensureDefaultConfigFile creates the file with full defaults if absent, and is a no-op if present", () => {
    expect(existsSync(configPath)).toBe(false);

    const provider = new ConfigFileProvider(configPath);
    provider.ensureDefaultConfigFile();
    expect(existsSync(configPath)).toBe(true);

    provider.setValue("port", 12345);
    provider.ensureDefaultConfigFile(); // should NOT reset port back to default
    expect(provider.port).toBe(12345);
  });

  it("handleApplicationStarted ensures the file exists and prunes unknown keys", () => {
    const provider = new ConfigFileProvider(configPath);
    provider.ensureDefaultConfigFile();
    provider.setValue("someLegacyRemovedField", "leftover");

    const freshProvider = new ConfigFileProvider(configPath);
    freshProvider.handleApplicationStarted();

    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(raw.someLegacyRemovedField).toBeUndefined();
    expect(raw.port).toBe(8787);
  });
});
