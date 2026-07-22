// Ported from NzbDrone.Core/Http/HttpProxySettingsProvider.cs
//
// Adaptation: the C# leans on System.Net.WebProxy.IsBypassed() to evaluate
// the bypass filter (wildcard host patterns + CIDR-like NetTools
// IPAddressRange) rather than reimplementing bypass matching itself. We
// don't have that helper in Node, so isBypassed() below reimplements the
// two things WebProxy.IsBypassed + the C#'s own IsBypassedByIpAddressRange
// helper actually did: (1) wildcard/plain hostname matching against the
// bypass list, and (2) exact IP-range containment for entries that parse as
// a CIDR range. This is a faithful-behavior reimplementation, not a
// wrapper, since there's no bundled equivalent -- see the inline comments
// for exactly which semantics were preserved.

import type { HttpUri } from "../HttpUri.js";
import { HttpProxySettings } from "./HttpProxySettings.js";
import type { IHttpProxySettingsProvider } from "./IHttpProxySettingsProvider.js";
import type { ConfigServiceProxySettings } from "./ConfigServiceProxySettings.js";

export class HttpProxySettingsProvider implements IHttpProxySettingsProvider {
  constructor(private readonly configService: ConfigServiceProxySettings) {}

  getProxySettingsForUri(uri: HttpUri): HttpProxySettings | null {
    const proxySettings = this.getProxySettings();
    if (proxySettings === null) {
      return null;
    }

    if (this.shouldProxyBeBypassed(proxySettings, uri)) {
      return null;
    }

    return proxySettings;
  }

  getProxySettings(): HttpProxySettings | null {
    if (!this.configService.proxyEnabled) {
      return null;
    }

    return new HttpProxySettings(
      this.configService.proxyType,
      this.configService.proxyHostname,
      this.configService.proxyPort,
      this.configService.proxyBypassFilter,
      this.configService.proxyBypassLocalAddresses,
      this.configService.proxyUsername,
      this.configService.proxyPassword
    );
  }

  shouldProxyBeBypassed(proxySettings: HttpProxySettings, url: HttpUri): boolean {
    if (proxySettings.bypassLocalAddress && this.isLocalAddress(url.host)) {
      return true;
    }

    return this.isBypassed(proxySettings.bypassListAsArray, url.host);
  }

  private isLocalAddress(host: string): boolean {
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  }

  private isBypassed(bypassList: string[], host: string): boolean {
    return bypassList.some((entry) => {
      // WebProxy's bypass-list entries prefixed with ";" (added by
      // HttpProxySettings.bypassListAsArray for wildcard entries) mean
      // "match as a regex/wildcard against the full URL"; the leading
      // ";" itself isn't part of the pattern.
      const pattern = entry.startsWith(";") ? entry.slice(1) : entry;

      if (this.isIpRangeMatch(pattern, host)) {
        return true;
      }

      return this.wildcardHostMatch(pattern, host);
    });
  }

  private wildcardHostMatch(pattern: string, host: string): boolean {
    if (!pattern.includes("*")) {
      return pattern.toLowerCase() === host.toLowerCase();
    }

    const regex = new RegExp(
      "^" + pattern.split("*").map(escapeRegex).join(".*") + "$",
      "i"
    );

    return regex.test(host);
  }

  private isIpRangeMatch(pattern: string, host: string): boolean {
    if (!pattern.includes("/")) {
      return false;
    }

    const [rangeIp, prefixStr] = pattern.split("/");
    const prefix = Number.parseInt(prefixStr ?? "", 10);

    if (!rangeIp || Number.isNaN(prefix)) {
      return false;
    }

    const hostBits = ipToBits(host);
    const rangeBits = ipToBits(rangeIp);

    if (hostBits === null || rangeBits === null || hostBits.length !== rangeBits.length) {
      return false;
    }

    const bitsToCompare = Math.min(prefix, hostBits.length);

    for (let i = 0; i < bitsToCompare; i++) {
      if (hostBits[i] !== rangeBits[i]) {
        return false;
      }
    }

    return true;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Converts a dotted-quad IPv4 address into an array of 32 bits, or null if not a valid IPv4 literal. */
function ipToBits(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const bits: number[] = [];

  for (const part of parts) {
    const octet = Number.parseInt(part, 10);
    if (Number.isNaN(octet) || octet < 0 || octet > 255) {
      return null;
    }

    for (let i = 7; i >= 0; i--) {
      bits.push((octet >> i) & 1);
    }
  }

  return bits;
}
