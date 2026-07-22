import { describe, expect, it } from "vitest";
import { HttpProxySettingsProvider } from "../proxy/HttpProxySettingsProvider.js";
import { ProxyType } from "../proxy/ProxyType.js";
import { HttpUri } from "../HttpUri.js";
import type { ConfigServiceProxySettings } from "../proxy/ConfigServiceProxySettings.js";

function config(overrides: Partial<ConfigServiceProxySettings> = {}): ConfigServiceProxySettings {
  return {
    proxyEnabled: true,
    proxyType: ProxyType.Http,
    proxyHostname: "proxy.example.com",
    proxyPort: 8080,
    proxyBypassFilter: "",
    proxyBypassLocalAddresses: true,
    proxyUsername: "",
    proxyPassword: "",
    ...overrides,
  };
}

describe("HttpProxySettingsProvider", () => {
  it("returns null when proxy is disabled", () => {
    const provider = new HttpProxySettingsProvider(config({ proxyEnabled: false }));
    expect(provider.getProxySettings()).toBeNull();
  });

  it("returns proxy settings built from config when enabled", () => {
    const provider = new HttpProxySettingsProvider(config());
    const settings = provider.getProxySettings();

    expect(settings).not.toBeNull();
    expect(settings!.host).toBe("proxy.example.com");
    expect(settings!.port).toBe(8080);
    expect(settings!.type).toBe(ProxyType.Http);
  });

  it("bypasses local addresses when bypassLocalAddress is set", () => {
    const provider = new HttpProxySettingsProvider(config({ proxyBypassLocalAddresses: true }));
    expect(provider.getProxySettingsForUri(new HttpUri("http://localhost/api"))).toBeNull();
  });

  it("does not bypass a non-local host", () => {
    const provider = new HttpProxySettingsProvider(config());
    expect(provider.getProxySettingsForUri(new HttpUri("https://indexer.example.com/api"))).not.toBeNull();
  });

  it("bypasses hosts matching a wildcard entry in the bypass filter", () => {
    const provider = new HttpProxySettingsProvider(
      config({ proxyBypassFilter: "*.internal.example.com", proxyBypassLocalAddresses: false })
    );

    expect(
      provider.getProxySettingsForUri(new HttpUri("https://indexer.internal.example.com/api"))
    ).toBeNull();
    expect(provider.getProxySettingsForUri(new HttpUri("https://public.example.com/api"))).not.toBeNull();
  });

  it("bypasses hosts within a CIDR range in the bypass filter", () => {
    const provider = new HttpProxySettingsProvider(
      config({ proxyBypassFilter: "10.0.0.0/24", proxyBypassLocalAddresses: false })
    );

    expect(provider.getProxySettingsForUri(new HttpUri("http://10.0.0.55/api"))).toBeNull();
    expect(provider.getProxySettingsForUri(new HttpUri("http://10.0.1.55/api"))).not.toBeNull();
  });
});
