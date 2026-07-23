import { describe, expect, it } from "vitest";
import {
  ReleaseUnavailableException as DownloadClientsReleaseUnavailableException,
  ReleaseBlockedException as DownloadClientsReleaseBlockedException,
  ReleaseDownloadException as DownloadClientsReleaseDownloadException,
} from "../../download-clients/TorrentClientBase.js";
import { DownloadClientRejectedReleaseException as DownloadClientsDownloadClientRejectedReleaseException } from "../../download-clients/sabnzbd/Sabnzbd.js";
import { TooManyRequestsException as HttpTooManyRequestsException } from "../../http/HttpException.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { HttpHeader } from "../../http/HttpHeader.js";
import {
  ReleaseUnavailableException,
  ReleaseBlockedException,
  ReleaseDownloadException,
  DownloadClientRejectedReleaseException,
  TooManyRequestsException,
} from "../downloadClients.js";

/**
 * Regression test for a real cross-module bug found during Phase 4 Wave 1
 * merge review: `download-tracking/downloadClients.ts` used to redeclare
 * its own third, independent copy of these exception classes (a forward-ref
 * predating both `download-clients` and `exceptions` landing). Since
 * `instanceof` only matches the exact class (or a subclass) an object was
 * constructed from -- not a textually-identical class declared elsewhere --
 * every `ex instanceof ReleaseUnavailableException` check in
 * downloadService.ts/processDownloadDecisions.ts would have silently never
 * matched an exception actually thrown by `download-clients`'
 * `TorrentClientBase.download()`/`Sabnzbd`'s real download-client code,
 * since those throw `download-clients`' own local exception classes, not
 * this module's old redeclared ones. This test proves the re-export fix
 * (downloadClients.ts now imports from `download-clients/` instead of
 * redeclaring) actually closes that gap: an exception constructed via the
 * real download-clients class must be `instanceof` the type this module's
 * catch blocks check against.
 */
describe("download-tracking's exception re-exports match download-clients' real throw sites", () => {
  it("ReleaseUnavailableException constructed by download-clients is instanceof this module's import", () => {
    const ex = new DownloadClientsReleaseUnavailableException("failed");
    expect(ex).toBeInstanceOf(ReleaseUnavailableException);
  });

  it("ReleaseBlockedException constructed by download-clients is instanceof this module's import", () => {
    const ex = new DownloadClientsReleaseBlockedException("blocked");
    expect(ex).toBeInstanceOf(ReleaseBlockedException);
  });

  it("ReleaseDownloadException constructed by download-clients is instanceof this module's import", () => {
    const ex = new DownloadClientsReleaseDownloadException("failed", new Error("inner"));
    expect(ex).toBeInstanceOf(ReleaseDownloadException);
  });

  it("DownloadClientRejectedReleaseException constructed by download-clients (Sabnzbd) is instanceof this module's import", () => {
    const ex = new DownloadClientsDownloadClientRejectedReleaseException("rejected");
    expect(ex).toBeInstanceOf(DownloadClientRejectedReleaseException);
  });

  it("ReleaseUnavailableException/ReleaseBlockedException/DownloadClientRejectedReleaseException are each instanceof ReleaseDownloadException (real inheritance chain)", () => {
    expect(new DownloadClientsReleaseUnavailableException("x")).toBeInstanceOf(
      ReleaseDownloadException
    );
    expect(new DownloadClientsReleaseBlockedException("x")).toBeInstanceOf(
      ReleaseDownloadException
    );
    expect(new DownloadClientsDownloadClientRejectedReleaseException("x")).toBeInstanceOf(
      ReleaseDownloadException
    );
  });

  it("the real http TooManyRequestsException is instanceof this module's re-exported import, with a real retryAfter (ms) from a Retry-After header", () => {
    const request = new HttpRequest("https://example.test/download");
    const headers = new HttpHeader();
    headers.set("Retry-After", "30");
    const response = new HttpResponse(request, headers, null, 429);

    const ex = new HttpTooManyRequestsException(request, response);

    expect(ex).toBeInstanceOf(TooManyRequestsException);
    expect(ex.retryAfter).toBe(30_000);
  });

  it("a ReleaseDownloadException wrapping a TooManyRequestsException exposes it via .cause, not a bespoke .innerException field", () => {
    const request = new HttpRequest("https://example.test/download");
    const headers = new HttpHeader();
    headers.set("Retry-After", "5");
    const response = new HttpResponse(request, headers, null, 429);
    const inner = new HttpTooManyRequestsException(request, response);

    const wrapped = new DownloadClientsReleaseDownloadException(
      "Downloading torrent failed",
      inner
    );

    expect(wrapped.cause).toBeInstanceOf(TooManyRequestsException);
    expect((wrapped.cause as HttpTooManyRequestsException).retryAfter).toBe(5_000);
  });
});
