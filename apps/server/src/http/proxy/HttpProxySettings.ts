// Ported from NzbDrone.Common/Http/Proxy/HttpProxySettings.cs

import { ProxyType } from "./ProxyType.js";

export class HttpProxySettings {
  readonly type: ProxyType;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly bypassFilter: string;
  readonly bypassLocalAddress: boolean;

  constructor(
    type: ProxyType,
    host: string | null | undefined,
    port: number,
    bypassFilter: string | null | undefined,
    bypassLocalAddress: boolean,
    username?: string | null,
    password?: string | null
  ) {
    this.type = type;
    this.host = isNullOrWhiteSpace(host) ? "127.0.0.1" : host;
    this.port = port;
    this.username = username ?? "";
    this.password = password ?? "";
    this.bypassFilter = bypassFilter ?? "";
    this.bypassLocalAddress = bypassLocalAddress;
  }

  get bypassListAsArray(): string[] {
    if (!isNullOrWhiteSpace(this.bypassFilter)) {
      const hostList = this.bypassFilter
        .split(",")
        .map((h) => h.trim())
        .filter((h) => h.length > 0);

      return hostList.map((h) => (h.startsWith("*") ? ";" + h : h));
    }

    return [];
  }

  get key(): string {
    return [
      this.type,
      this.host,
      this.port,
      this.username,
      this.password,
      this.bypassFilter,
      this.bypassLocalAddress,
    ].join("_");
  }
}

function isNullOrWhiteSpace(value: string | null | undefined): value is null | undefined | "" {
  return value === null || value === undefined || value.trim() === "";
}
