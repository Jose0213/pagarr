import { describe, expect, it, vi } from "vitest";
import {
  HttpHeader,
  HttpRequestBuilder,
  HttpResponse,
  type IHttpClient,
} from "../../../http/index.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { ProxyCheck } from "../proxyCheck.js";

/** New tests -- no dedicated C# fixture exercises DNS-resolution failure/ping success directly (SystemTimeCheckFixture.cs's pattern is the closest analog, reused here). */

const cloudRequestBuilder = new HttpRequestBuilder("https://cloud.example.com").createFactory();

describe("ProxyCheck", () => {
  it("returns Ok when the proxy is disabled", async () => {
    const client: IHttpClient = {
      execute: async () => {
        throw new Error("should not be called");
      },
    };
    const check = new ProxyCheck(
      cloudRequestBuilder,
      { proxyEnabled: false, proxyHostname: "" },
      client,
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Ok);
  });

  it("returns Error when the proxy hostname fails DNS resolution", async () => {
    const client: IHttpClient = {
      execute: async () => {
        throw new Error("should not be called");
      },
    };
    const check = new ProxyCheck(
      cloudRequestBuilder,
      { proxyEnabled: true, proxyHostname: "this-host-does-not-exist.invalid" },
      client,
      new NullLocalizationService()
    );

    const result = await check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("proxy-failed-resolve-ip");
  });

  it("returns Ok when the proxy resolves and the ping request succeeds (non-400)", async () => {
    const client: IHttpClient = {
      execute: async (req) => new HttpResponse(req, new HttpHeader(), "", 200),
    };
    const check = new ProxyCheck(
      cloudRequestBuilder,
      { proxyEnabled: true, proxyHostname: "localhost" },
      client,
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Ok);
  });

  it("returns Error when the ping request returns 400", async () => {
    const client: IHttpClient = {
      execute: async (req) => new HttpResponse(req, new HttpHeader(), "", 400),
    };
    const check = new ProxyCheck(
      cloudRequestBuilder,
      { proxyEnabled: true, proxyHostname: "localhost" },
      client,
      new NullLocalizationService()
    );

    const result = await check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("proxy-failed-test");
  });

  it("returns Error and logs when the ping request throws", async () => {
    const client: IHttpClient = {
      execute: async () => {
        throw new Error("network error");
      },
    };
    const onError = vi.fn();
    const check = new ProxyCheck(
      cloudRequestBuilder,
      { proxyEnabled: true, proxyHostname: "localhost" },
      client,
      new NullLocalizationService(),
      { error: onError }
    );

    const result = await check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(onError).toHaveBeenCalled();
  });
});
