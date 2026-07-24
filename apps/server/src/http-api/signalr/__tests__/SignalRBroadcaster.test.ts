import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelAction } from "../../../db/events.js";
import { SignalRBroadcaster } from "../SignalRBroadcaster.js";

let server: Server;
let broadcaster: SignalRBroadcaster;
let port: number;

beforeEach(async () => {
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  broadcaster?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/**
 * Buffers every message received from the moment the socket is created
 * (not from whenever a test happens to call `nextMessage`) -- Node's
 * EventEmitter doesn't replay events to a listener attached after the
 * event already fired, and the server may push its "version" welcome
 * message immediately on connect, before a test has a chance to call
 * `nextMessage`. This queue makes message order deterministic regardless
 * of when a test asks for the next one.
 */
function connect(
  path = "/signalr"
): Promise<{ ws: WebSocket; nextMessage: () => Promise<unknown> }> {
  const queue: unknown[] = [];
  const waiters: ((value: unknown) => void)[] = [];

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}${path}`);

    ws.on("message", (data: Buffer) => {
      const parsed: unknown = JSON.parse(data.toString("utf-8"));
      const waiter = waiters.shift();
      if (waiter) {
        waiter(parsed);
      } else {
        queue.push(parsed);
      }
    });

    ws.once("open", () => {
      resolve({
        ws,
        nextMessage: () =>
          new Promise((resolveMessage) => {
            const buffered = queue.shift();
            if (buffered !== undefined) {
              resolveMessage(buffered);
            } else {
              waiters.push(resolveMessage);
            }
          }),
      });
    });
    ws.once("error", reject);
  });
}

describe("SignalRBroadcaster", () => {
  it("isConnected is false with no clients, true once one connects", async () => {
    broadcaster = new SignalRBroadcaster(server, "/signalr");
    expect(broadcaster.isConnected).toBe(false);

    const { ws } = await connect();
    // Give the 'connection' event a tick to fire server-side.
    await new Promise((r) => setTimeout(r, 20));

    expect(broadcaster.isConnected).toBe(true);
    ws.close();
  });

  it("sends the version welcome message to a newly-connected client", async () => {
    broadcaster = new SignalRBroadcaster(server, "/signalr", { version: "1.2.3" });
    const { ws, nextMessage } = await connect();

    const message = await nextMessage();

    expect(message).toEqual({ name: "version", body: { version: "1.2.3" } });
    ws.close();
  });

  it("does not send a version message when none is configured", async () => {
    broadcaster = new SignalRBroadcaster(server, "/signalr");
    const { ws } = await connect();

    let received = false;
    ws.once("message", () => {
      received = true;
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toBe(false);
    ws.close();
  });

  it("broadcastMessage sends to every connected client", async () => {
    broadcaster = new SignalRBroadcaster(server, "/signalr");
    const a = await connect();
    const b = await connect();
    await new Promise((r) => setTimeout(r, 20));

    const messageA = a.nextMessage();
    const messageB = b.nextMessage();

    broadcaster.broadcastMessage({ name: "test", body: { hello: "world" } });

    expect(await messageA).toEqual({ name: "test", body: { hello: "world" } });
    expect(await messageB).toEqual({ name: "test", body: { hello: "world" } });

    a.ws.close();
    b.ws.close();
  });

  it("broadcastResourceChange builds {name, body: {resource, action}} and no-ops when nothing is connected", () => {
    broadcaster = new SignalRBroadcaster(server, "/signalr");
    // No connected clients -- must not throw.
    expect(() =>
      broadcaster.broadcastResourceChange(ModelAction.Updated, "book", { id: 1 })
    ).not.toThrow();
  });

  it("broadcastResourceChange sends the full envelope for a Created/Updated action", async () => {
    broadcaster = new SignalRBroadcaster(server, "/signalr");
    const { ws, nextMessage } = await connect();
    await new Promise((r) => setTimeout(r, 20));

    const message = nextMessage();
    broadcaster.broadcastResourceChange(ModelAction.Updated, "book", { id: 7, title: "Dune" });

    expect(await message).toEqual({
      name: "book",
      body: { resource: { id: 7, title: "Dune" }, action: "Updated" },
    });

    ws.close();
  });

  it("broadcastResourceChange omits resource for a Deleted action", async () => {
    broadcaster = new SignalRBroadcaster(server, "/signalr");
    const { ws, nextMessage } = await connect();
    await new Promise((r) => setTimeout(r, 20));

    const message = nextMessage();
    broadcaster.broadcastResourceChange(ModelAction.Deleted, "book");

    expect(await message).toEqual({ name: "book", body: { action: "Deleted" } });

    ws.close();
  });

  it("stops tracking a connection once it closes", async () => {
    broadcaster = new SignalRBroadcaster(server, "/signalr");
    const { ws } = await connect();
    await new Promise((r) => setTimeout(r, 20));
    expect(broadcaster.isConnected).toBe(true);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));

    expect(broadcaster.isConnected).toBe(false);
  });
});
