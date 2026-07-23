import { describe, expect, it } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpException } from "../../../http/HttpException.js";
import { fakeHttpClient, noopLogger } from "../../__tests__/testFixtures.js";
import { SignalProxy } from "../SignalProxy.js";
import { createSignalSettings } from "../SignalSettings.js";

describe("SignalProxy", () => {
  it("builds the v2/send URL from host/port/useSsl and posts a JSON payload", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new SignalProxy(httpClient, noopLogger());
    const settings = createSignalSettings({
      host: "localhost",
      port: 8080,
      useSsl: false,
      senderNumber: "+15551234567",
      receiverId: "+15557654321",
    });

    await proxy.sendNotification("Book Grabbed", "Some Book", settings);

    expect(httpClient.calls).toHaveLength(1);
    const request = httpClient.calls[0]!;
    expect(request.method).toBe("POST");
    expect(request.url.toString()).toBe("http://localhost:8080/v2/send");
    expect(request.headers.contentType).toBe("application/json");

    const body = JSON.parse(new TextDecoder().decode(request.contentData));
    expect(body).toEqual({
      message: "Book Grabbed\nSome Book\n",
      number: "+15551234567",
      recipients: ["+15557654321"],
    });
  });

  it("uses https when useSsl is true", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new SignalProxy(httpClient, noopLogger());
    const settings = createSignalSettings({
      host: "signal.example.com",
      port: 443,
      useSsl: true,
      senderNumber: "+1",
      receiverId: "+2",
    });

    await proxy.sendNotification("t", "m", settings);

    expect(httpClient.calls[0]!.url.toString()).toBe("https://signal.example.com:443/v2/send");
  });

  it("sets basic auth credentials only when both authUsername and authPassword are provided", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new SignalProxy(httpClient, noopLogger());
    const settings = createSignalSettings({
      host: "localhost",
      port: 8080,
      senderNumber: "+1",
      receiverId: "+2",
      authUsername: "user",
      authPassword: "pass",
    });

    await proxy.sendNotification("t", "m", settings);

    expect(httpClient.calls[0]!.credentials).toEqual({
      kind: "basic",
      userName: "user",
      password: "pass",
    });
  });

  it("leaves credentials null when only one of authUsername/authPassword is set", async () => {
    const httpClient = fakeHttpClient();
    const proxy = new SignalProxy(httpClient, noopLogger());
    const settings = createSignalSettings({
      host: "localhost",
      port: 8080,
      senderNumber: "+1",
      receiverId: "+2",
      authUsername: "user",
      authPassword: "",
    });

    await proxy.sendNotification("t", "m", settings);

    expect(httpClient.calls[0]!.credentials).toBeNull();
  });

  describe("test()", () => {
    it("maps a 400 'plain HTTP request sent to HTTPS port' body to UseSsl", async () => {
      const failingClient = fixedFailureClient(
        400,
        "400 The plain HTTP request was sent to HTTPS port blah blah"
      );
      const proxy = new SignalProxy(failingClient, noopLogger());

      const failure = await proxy.test(
        createSignalSettings({
          host: "localhost",
          port: 8080,
          senderNumber: "+1",
          receiverId: "+2",
        })
      );

      expect(failure).toEqual({ propertyName: "UseSsl", errorMessage: "SSL seems to be required" });
    });

    it("maps a 400 'Invalid group id' error to ReceiverId", async () => {
      const failingClient = fixedFailureClient(
        400,
        JSON.stringify({ error: "Invalid group id: xyz" })
      );
      const proxy = new SignalProxy(failingClient, noopLogger());

      const failure = await proxy.test(
        createSignalSettings({
          host: "localhost",
          port: 8080,
          senderNumber: "+1",
          receiverId: "+2",
        })
      );

      expect(failure).toEqual({
        propertyName: "ReceiverId",
        errorMessage: "Unable to send test message: Invalid group id: xyz",
      });
    });

    it("maps a 400 'Invalid account' error to SenderNumber", async () => {
      const failingClient = fixedFailureClient(
        400,
        JSON.stringify({ error: "Invalid account: xyz" })
      );
      const proxy = new SignalProxy(failingClient, noopLogger());

      const failure = await proxy.test(
        createSignalSettings({
          host: "localhost",
          port: 8080,
          senderNumber: "+1",
          receiverId: "+2",
        })
      );

      expect(failure?.propertyName).toBe("SenderNumber");
    });

    it("maps an unrecognized 400 error to Host", async () => {
      const failingClient = fixedFailureClient(400, JSON.stringify({ error: "something else" }));
      const proxy = new SignalProxy(failingClient, noopLogger());

      const failure = await proxy.test(
        createSignalSettings({
          host: "localhost",
          port: 8080,
          senderNumber: "+1",
          receiverId: "+2",
        })
      );

      expect(failure).toEqual({
        propertyName: "Host",
        errorMessage: "Unable to send test message: something else",
      });
    });

    it("maps a 401 response to AuthUsername / Login/Password invalid", async () => {
      const failingClient = fixedFailureClient(401, "");
      const proxy = new SignalProxy(failingClient, noopLogger());

      const failure = await proxy.test(
        createSignalSettings({
          host: "localhost",
          port: 8080,
          senderNumber: "+1",
          receiverId: "+2",
        })
      );

      expect(failure).toEqual({
        propertyName: "AuthUsername",
        errorMessage: "Login/Password invalid",
      });
    });

    it("maps any other HttpException status to a generic Host failure", async () => {
      const failingClient = fixedFailureClient(500, "server error");
      const proxy = new SignalProxy(failingClient, noopLogger());

      const failure = await proxy.test(
        createSignalSettings({
          host: "localhost",
          port: 8080,
          senderNumber: "+1",
          receiverId: "+2",
        })
      );

      expect(failure?.propertyName).toBe("Host");
      expect(failure?.errorMessage).toContain("Unable to send test message");
    });

    it("returns null on success", async () => {
      const httpClient = fakeHttpClient();
      const proxy = new SignalProxy(httpClient, noopLogger());

      const failure = await proxy.test(
        createSignalSettings({
          host: "localhost",
          port: 8080,
          senderNumber: "+1",
          receiverId: "+2",
        })
      );

      expect(failure).toBeNull();
    });
  });
});

function fixedFailureClient(statusCode: number, content: string) {
  const fail = async (request: never) => {
    const response = new HttpResponse(request, new HttpHeader(), content, statusCode);
    throw new HttpException(request, response);
  };

  return {
    execute: fail,
    get: fail,
    post: fail,
    head: fail,
    getTyped: fail,
    postTyped: fail,
    downloadFile: fail,
  };
}
