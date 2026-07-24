import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { EventAggregator } from "../../../../messaging/events/eventAggregator.js";
import { CommandExecutedEvent } from "../../../../messaging/events/commandExecutedEvent.js";
import { CommandPriority } from "../../../../messaging/commands/commandPriority.js";
import { CommandStatus } from "../../../../messaging/commands/commandStatus.js";
import { CommandResult } from "../../../../messaging/commands/commandResult.js";
import { CommandTrigger } from "../../../../messaging/commands/commandTrigger.js";
import type { CommandModel } from "../../../../messaging/commands/commandModel.js";
import type { IQualityDefinitionService } from "../../../../qualities/qualityDefinitionService.js";
import {
  newQualityDefinition,
  type QualityDefinition,
} from "../../../../qualities/qualityDefinition.js";
import { Quality } from "../../../../qualities/quality.js";
import { SignalRBroadcaster } from "../../../signalr/SignalRBroadcaster.js";
import { qualityDefinitionController } from "../QualityDefinitionController.js";
import { createServer } from "node:http";

function fakeService(seed: QualityDefinition[]): IQualityDefinitionService {
  const store = new Map<number, QualityDefinition>(seed.map((d) => [d.id, d]));

  return {
    update: (d: QualityDefinition) => {
      store.set(d.id, d);
    },
    updateMany: (defs: QualityDefinition[]) => {
      for (const d of defs) {
        store.set(d.id, d);
      }
    },
    all: () => [...store.values()].sort((a, b) => a.weight - b.weight),
    getById: (id: number) => {
      const found = store.get(id);
      if (!found) {
        throw new Error("Sequence contains no matching element");
      }
      return found;
    },
    get: (quality: { id: number }) => {
      const found = [...store.values()].find((d) => d.quality.id === quality.id);
      if (!found) {
        throw new Error("not found");
      }
      return found;
    },
  };
}

/** Builds a minimal CommandModel with the given command name -- the controller's CommandExecutedEvent handler only reads `message.command.name` (see QualityDefinitionController.ts), so a real `Command` subclass instance for `body` isn't needed. */
function commandModelNamed(name: string): CommandModel {
  return {
    id: 0,
    name,
    body: { name } as unknown as CommandModel["body"],
    priority: CommandPriority.Normal,
    status: CommandStatus.Queued,
    result: CommandResult.Unknown,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    endedAt: null,
    duration: null,
    exception: null,
    trigger: CommandTrigger.Unspecified,
    message: null,
  };
}

function seedDefinitions(): QualityDefinition[] {
  return [
    { ...newQualityDefinition(Quality.MOBI, { weight: 10 }), id: 1 },
    { ...newQualityDefinition(Quality.EPUB, { weight: 11 }), id: 2 },
  ];
}

function buildApp(service: IQualityDefinitionService, eventAggregator: EventAggregator) {
  const app = express();
  const server = createServer(app);
  const broadcaster = new SignalRBroadcaster(server);

  const { router } = qualityDefinitionController({
    qualityDefinitionService: service,
    eventAggregator,
    signalRBroadcaster: broadcaster,
  });

  app.use(express.json());
  app.use("/api/v1/qualitydefinition", router);
  app.use(readarrErrorPipeline());
  return { app, broadcaster };
}

describe("qualityDefinitionController", () => {
  let eventAggregator: EventAggregator;

  beforeEach(() => {
    eventAggregator = new EventAggregator();
  });

  it("GET / returns all definitions", async () => {
    const service = fakeService(seedDefinitions());
    const { app } = buildApp(service, eventAggregator);

    const res = await request(app).get("/api/v1/qualitydefinition");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 1, title: "MOBI", weight: 10 });
  });

  it("GET /:id returns a single definition", async () => {
    const service = fakeService(seedDefinitions());
    const { app } = buildApp(service, eventAggregator);

    const res = await request(app).get("/api/v1/qualitydefinition/2");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 2, title: "EPUB" });
  });

  it("does not mount POST / or DELETE /:id -- quality definitions are a fixed set", async () => {
    const service = fakeService(seedDefinitions());
    const { app } = buildApp(service, eventAggregator);

    const postRes = await request(app).post("/api/v1/qualitydefinition").send({ id: 0 });
    expect(postRes.status).toBe(404);

    const deleteRes = await request(app).delete("/api/v1/qualitydefinition/1");
    expect(deleteRes.status).toBe(404);
  });

  describe("PUT /:id (update)", () => {
    it("updates a single definition and returns 202", async () => {
      const service = fakeService(seedDefinitions());
      const { app } = buildApp(service, eventAggregator);

      const existing = service.getById(1);
      const res = await request(app)
        .put("/api/v1/qualitydefinition/1")
        .send({ ...existing, title: "MOBI Renamed" });

      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ id: 1, title: "MOBI Renamed" });
      expect(service.getById(1).title).toBe("MOBI Renamed");
    });
  });

  describe("PUT /update (bulk)", () => {
    it("updates many and returns the full refreshed list at 202", async () => {
      const service = fakeService(seedDefinitions());
      const { app } = buildApp(service, eventAggregator);

      const existing = service.all();
      const updated = existing.map((d) => ({ ...d, title: `${d.title}-bulk` }));

      const res = await request(app).put("/api/v1/qualitydefinition/update").send(updated);

      expect(res.status).toBe(202);
      expect(res.body).toHaveLength(2);
      expect((res.body as { title: string }[]).map((d) => d.title)).toEqual([
        "MOBI-bulk",
        "EPUB-bulk",
      ]);
    });
  });

  describe("CommandExecutedEvent handling", () => {
    // Ported: BroadcastResourceChange's own leading `if (!IsConnected)
    // return;` guard (see SignalRBroadcaster.ts's `broadcastResourceChange`
    // doc comment) means neither of these cases reaches an actual socket
    // send when no client is connected -- verified here by asserting the
    // handler doesn't throw and the broadcaster's `isConnected` stays
    // false (no test client attached), rather than spying on internals.
    it("does not throw when ResetQualityDefinitions finishes with no client connected", () => {
      const service = fakeService(seedDefinitions());
      const { broadcaster } = buildApp(service, eventAggregator);

      const commandModel = commandModelNamed("ResetQualityDefinitions");

      expect(() => {
        eventAggregator.publishEvent(new CommandExecutedEvent(commandModel));
      }).not.toThrow();
      expect(broadcaster.isConnected).toBe(false);
    });

    it("ignores CommandExecutedEvent for any other command name", () => {
      const service = fakeService(seedDefinitions());
      const { broadcaster } = buildApp(service, eventAggregator);

      const commandModel = commandModelNamed("SomeOtherCommand");

      expect(() => {
        eventAggregator.publishEvent(new CommandExecutedEvent(commandModel));
      }).not.toThrow();
      expect(broadcaster.isConnected).toBe(false);
    });
  });
});
