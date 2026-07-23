import { describe, expect, it, vi } from "vitest";
import {
  HttpHeader,
  HttpRequest,
  HttpRequestBuilder,
  HttpResponse,
  type IHttpClient,
} from "../../http/index.js";
import { HealthCheckResult } from "../healthCheck.js";
import { ServerSideNotificationService } from "../serverSideNotificationService.js";

/** Translates the behavior ServerSideNotificationService.cs's GetServerChecks/RetrieveServerChecks encode. */

function fakeClient(handler: (request: HttpRequest) => HttpResponse): IHttpClient {
  return {
    execute: async (request) => handler(request),
  };
}

const cloudRequestBuilder = new HttpRequestBuilder("https://cloud.example.com").createFactory();

describe("ServerSideNotificationService", () => {
  it("maps a successful server response into HealthCheck results", async () => {
    const client = fakeClient(
      (req) =>
        new HttpResponse(
          req,
          new HttpHeader(),
          JSON.stringify([
            { Type: HealthCheckResult.Warning, Message: "watch out", WikiUrl: "#watch-out" },
          ])
        )
    );

    const service = new ServerSideNotificationService(client, cloudRequestBuilder, {
      version: "1.0.0",
      os: "Linux",
      arch: "x64",
      branch: "develop",
    });

    const results = await service.getServerChecks();

    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe(HealthCheckResult.Warning);
    expect(results[0]!.message).toBe("watch out");
  });

  it("swallows errors and returns an empty list, logging instead of throwing", async () => {
    const client: IHttpClient = {
      execute: async () => {
        throw new Error("network down");
      },
    };
    const onError = vi.fn();

    const service = new ServerSideNotificationService(
      client,
      cloudRequestBuilder,
      { version: "1.0.0", os: "Linux", arch: "x64", branch: "develop" },
      undefined,
      { trace: () => {}, error: onError }
    );

    const results = await service.getServerChecks();

    expect(results).toEqual([]);
    expect(onError).toHaveBeenCalled();
  });

  it("caches results for the TTL and re-fetches once expired", async () => {
    let callCount = 0;
    const client = fakeClient((req) => {
      callCount++;
      return new HttpResponse(req, new HttpHeader(), JSON.stringify([]));
    });

    let now = 0;
    const clock = { now: () => now };

    const service = new ServerSideNotificationService(
      client,
      cloudRequestBuilder,
      { version: "1.0.0", os: "Linux", arch: "x64", branch: "develop" },
      clock
    );

    await service.getServerChecks();
    expect(callCount).toBe(1);

    // Still within the 2-hour TTL -- should be served from cache.
    now += 60 * 60 * 1000;
    await service.getServerChecks();
    expect(callCount).toBe(1);

    // Past the 2-hour TTL -- should re-fetch.
    now += 2 * 60 * 60 * 1000;
    await service.getServerChecks();
    expect(callCount).toBe(2);
  });
});
