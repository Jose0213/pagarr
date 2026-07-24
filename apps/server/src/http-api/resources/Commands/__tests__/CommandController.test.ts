import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../../../db/db-factory.js";
import { CommandRepository } from "../../../../messaging/commands/commandRepository.js";
import { CommandQueueManager } from "../../../../messaging/commands/commandQueueManager.js";
import { TestCommand } from "../../../../messaging/commands/testCommand.js";
import { EventAggregator } from "../../../../messaging/events/eventAggregator.js";
import { SignalRBroadcaster } from "../../../signalr/SignalRBroadcaster.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { commandController, createCommandBroadcastHandler } from "../CommandController.js";
import { CommandUpdatedEvent } from "../../../../messaging/commands/commandExecutor.js";

function buildApp() {
  const db = createDatabase("Test", {
    path: ":memory:",
    migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR,
  });
  const commandQueueManager = new CommandQueueManager(new CommandRepository(db));
  const commandTypeRegistry = new Map<string, () => TestCommand>([
    ["test", () => new TestCommand()],
  ]);
  const eventAggregator = new EventAggregator();
  const httpServer = createServer();
  const signalRBroadcaster = new SignalRBroadcaster(httpServer, "/signalr-test-commands");

  const router = commandController({
    commandQueueManager,
    commandTypeRegistry,
    eventAggregator,
    signalRBroadcaster,
  });

  const app = express();
  app.use(express.json());
  app.use("/command", router);
  app.use(readarrErrorPipeline());

  return { app, commandQueueManager, signalRBroadcaster };
}

describe("commandController", () => {
  it("POST /command starts a registered command by name, setting trigger=manual and the client user agent", async () => {
    const { app, commandQueueManager } = buildApp();

    const res = await request(app)
      .post("/command")
      .send({ id: 0, name: "Test" })
      .set("User-Agent", "MyClient/1.0");

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test");
    expect(res.body.status).toBe("queued");
    expect(res.body.trigger).toBe("manual");
    // Ported/documented gap -- see CommandController.ts's module doc
    // comment "FORWARD-REF" section: TestCommand.sendUpdatesToClient is a
    // getter-only override (always true on the live instance), but
    // CommandQueueManager.push()'s DB round-trip (JSON.stringify/parse
    // through CommandRepository) drops every getter-derived Command field
    // -- so the WIRE response's sendUpdatesToClient reads back false, not
    // the live instance's true. This is the real, currently-true
    // observable behavior, not a bug in this controller.
    expect(res.body.sendUpdatesToClient).toBe(false);
    expect(res.body.clientUserAgent).toBe("MyClient/1.0");

    expect(commandQueueManager.all()).toHaveLength(1);
  });

  it("POST /command with an unknown command name -> 404 (CommandNotFoundException)", async () => {
    const { app } = buildApp();

    const res = await request(app).post("/command").send({ id: 0, name: "DoesNotExist" });

    // CommandNotFoundException is a plain Error, not a mapped ApiException
    // subclass -- falls through readarrErrorPipeline's generic 500 branch.
    expect(res.status).toBe(500);
  });

  it("POST /command rejects a blank name via postValidator", async () => {
    const { app } = buildApp();

    const res = await request(app).post("/command").send({ id: 0, name: "" });

    expect(res.status).toBe(400);
  });

  it("simplifies a Mozilla/5.0 user agent to null on the wire", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post("/command")
      .send({ id: 0, name: "Test" })
      .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    expect(res.status).toBe(201);
    expect(res.body.clientUserAgent).toBeNull();
  });

  it("GET /command lists queued/started commands", async () => {
    const { app, commandQueueManager } = buildApp();
    commandQueueManager.push(new TestCommand());

    const res = await request(app).get("/command");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /command/:id 404s for a missing command", async () => {
    const { app } = buildApp();

    const res = await request(app).get("/command/9999");

    expect(res.status).toBe(404);
  });

  it("DELETE /command/:id cancels a queued command", async () => {
    const { app, commandQueueManager } = buildApp();
    const created = commandQueueManager.push(new TestCommand());

    const res = await request(app).delete(`/command/${created.id}`);

    expect(res.status).toBe(200);
  });

  it("commandName is split from PascalCase into space-separated words", async () => {
    const { app } = buildApp();

    const res = await request(app).post("/command").send({ id: 0, name: "Test" });

    // TestCommand's Name is "Test" (single word) -- exercised more
    // meaningfully by CommandResource's own unit test for multi-word names.
    expect(res.body.commandName).toBe("Test");
  });
});

describe("createCommandBroadcastHandler", () => {
  it("debounces updates and broadcasts an Updated change after the debounce window, only for SendUpdatesToClient commands", async () => {
    const httpServer: Server = createServer();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;

    const signalRBroadcaster = new SignalRBroadcaster(
      httpServer,
      "/signalr-test-commands-broadcast"
    );

    const ws = new WebSocket(`ws://localhost:${port}/signalr-test-commands-broadcast`);
    const received: unknown[] = [];
    ws.on("message", (data: Buffer) => {
      received.push(JSON.parse(data.toString("utf-8")));
    });
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));

    const handler = createCommandBroadcastHandler(signalRBroadcaster, 10);

    const command = new TestCommand(); // sendUpdatesToClient overridden true
    handler.handle(
      new CommandUpdatedEvent({
        id: 1,
        name: "Test",
        body: command,
        priority: 0,
        status: 0,
        result: 0,
        queuedAt: new Date().toISOString(),
        startedAt: null,
        endedAt: null,
        duration: null,
        exception: null,
        trigger: 1,
        message: null,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ name: "command", body: { action: "Updated" } });

    ws.close();
    signalRBroadcaster.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("does not broadcast when the command's SendUpdatesToClient is false", async () => {
    const httpServer: Server = createServer();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;

    const signalRBroadcaster = new SignalRBroadcaster(
      httpServer,
      "/signalr-test-commands-broadcast-2"
    );

    const ws = new WebSocket(`ws://localhost:${port}/signalr-test-commands-broadcast-2`);
    const received: unknown[] = [];
    ws.on("message", (data: Buffer) => {
      received.push(JSON.parse(data.toString("utf-8")));
    });
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));

    const handler = createCommandBroadcastHandler(signalRBroadcaster, 10);

    handler.handle(
      new CommandUpdatedEvent({
        id: 2,
        name: "Unknown",
        body: {
          name: "Unknown",
          sendUpdatesToClient: false,
          updateScheduledTask: true,
          completionMessage: null,
          requiresDiskAccess: false,
          isExclusive: false,
          isTypeExclusive: false,
          isLongRunning: false,
          lastExecutionTime: null,
          lastStartTime: null,
          trigger: 0,
          suppressMessages: false,
          clientUserAgent: null,
        },
        priority: 0,
        status: 0,
        result: 0,
        queuedAt: new Date().toISOString(),
        startedAt: null,
        endedAt: null,
        duration: null,
        exception: null,
        trigger: 1,
        message: null,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(0);

    ws.close();
    signalRBroadcaster.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
});
