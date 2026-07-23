import { describe, expect, it } from "vitest";
import {
  HttpHeader,
  HttpRequestBuilder,
  HttpResponse,
  type IHttpClient,
} from "../../../http/index.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { SystemTimeCheck } from "../systemTimeCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/SystemTimeCheckFixture.cs. */

const cloudRequestBuilder = new HttpRequestBuilder("https://cloud.example.com").createFactory();

function clientReturningServerTime(dateTimeUtc: Date): IHttpClient {
  return {
    execute: async (request) =>
      new HttpResponse(
        request,
        new HttpHeader(),
        JSON.stringify({ DateTimeUtc: dateTimeUtc.toISOString() })
      ),
  };
}

describe("SystemTimeCheck", () => {
  it("should_not_return_error_when_system_time_is_close_to_server_time", async () => {
    const check = new SystemTimeCheck(
      clientReturningServerTime(new Date()),
      cloudRequestBuilder,
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_error_when_system_time_is_more_than_one_day_from_server_time", async () => {
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const check = new SystemTimeCheck(
      clientReturningServerTime(twoDaysFromNow),
      cloudRequestBuilder,
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Error);
  });
});
