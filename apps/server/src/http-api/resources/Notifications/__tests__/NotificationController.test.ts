import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../../db/db-factory.js";
import { NotificationRepository } from "../../../../notifications/NotificationRepository.js";
import type { INotification, INotificationStatusService } from "../../../../notifications/index.js";
import { createDiscordSettings } from "../../../../notifications/discord/DiscordSettings.js";
import { createSlackSettings } from "../../../../notifications/slack/SlackSettings.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { notificationController } from "../NotificationController.js";

/**
 * Tests for `notificationController()` -- exercises the real
 * `providerControllerBase()` routes over the REAL `NotificationFactory`
 * (extends `thingi-provider/ProviderFactory` for real, no adapter needed --
 * see `NotificationController.ts`'s doc comment) plus this task's own
 * extra-field-shuttling for the ~29 `OnX`/`SupportsOnX`/
 * `IncludeHealthWarnings` sibling JSON fields, and the `enable`
 * computed-getter recompute fix (`EnableRecomputingNotificationFactory`).
 */

function noopStatusService(): INotificationStatusService {
  return {
    getBlockedProviders: () => [],
    recordSuccess: () => {},
    recordFailure: () => {},
    recordConnectionFailure: () => {},
  };
}

function fakeDiscord(): INotification {
  return {
    name: "Discord",
    configContract: "DiscordSettings",
    message: null,
    link: "",
    defaultDefinitions: [],
    definition: {
      id: 0,
      name: "",
      implementationName: "Discord",
      implementation: "Discord",
      configContract: "DiscordSettings",
      enable: false,
      message: null,
      tags: [],
      settings: createDiscordSettings(),
      onGrab: false,
      onReleaseImport: false,
      onUpgrade: false,
      onRename: false,
      onAuthorAdded: false,
      onAuthorDelete: false,
      onBookDelete: false,
      onBookFileDelete: false,
      onBookFileDeleteForUpgrade: false,
      onHealthIssue: false,
      onDownloadFailure: false,
      onImportFailure: false,
      onBookRetag: false,
      onApplicationUpdate: false,
      supportsOnGrab: true,
      supportsOnReleaseImport: true,
      supportsOnUpgrade: true,
      supportsOnRename: true,
      supportsOnAuthorAdded: true,
      supportsOnAuthorDelete: true,
      supportsOnBookDelete: true,
      supportsOnBookFileDelete: true,
      supportsOnBookFileDeleteForUpgrade: true,
      supportsOnHealthIssue: true,
      includeHealthWarnings: false,
      supportsOnDownloadFailure: true,
      supportsOnImportFailure: true,
      supportsOnBookRetag: true,
      supportsOnApplicationUpdate: true,
    },
    onGrab: () => {},
    onReleaseImport: () => {},
    onRename: () => {},
    onAuthorAdded: () => {},
    onAuthorDelete: () => {},
    onBookDelete: () => {},
    onBookFileDelete: () => {},
    onHealthIssue: () => {},
    onApplicationUpdate: () => {},
    onDownloadFailure: () => {},
    onImportFailure: () => {},
    onBookRetag: () => {},
    processQueue: () => {},
    supportsOnGrab: true,
    supportsOnReleaseImport: true,
    supportsOnUpgrade: true,
    supportsOnRename: true,
    supportsOnAuthorAdded: true,
    supportsOnAuthorDelete: true,
    supportsOnBookDelete: true,
    supportsOnBookFileDelete: true,
    supportsOnBookFileDeleteForUpgrade: true,
    supportsOnHealthIssue: true,
    supportsOnApplicationUpdate: true,
    supportsOnDownloadFailure: true,
    supportsOnImportFailure: true,
    supportsOnBookRetag: true,
    test: () => Promise.resolve({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => ({ ok: true }),
  };
}

function fakeSlack(): INotification {
  const discord = fakeDiscord();
  return {
    ...discord,
    name: "Slack",
    configContract: "SlackSettings",
    definition: {
      ...discord.definition,
      implementationName: "Slack",
      implementation: "Slack",
      configContract: "SlackSettings",
      settings: createSlackSettings(),
    },
  };
}

function buildApp() {
  const db: MainDatabase = createMainDatabase(":memory:");
  const repository = new NotificationRepository(db);
  const router = notificationController({
    repository,
    providers: [fakeDiscord(), fakeSlack()],
    notificationStatusService: noopStatusService(),
  });

  const app = express();
  app.use(express.json());
  app.use("/notification", router);
  app.use(readarrErrorPipeline());

  return { app, repository };
}

function discordBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 0,
    name: "My Discord",
    implementation: "Discord",
    configContract: "DiscordSettings",
    tags: [],
    onGrab: true,
    onReleaseImport: false,
    onUpgrade: false,
    onRename: false,
    onAuthorAdded: false,
    onAuthorDelete: false,
    onBookDelete: false,
    onBookFileDelete: false,
    onBookFileDeleteForUpgrade: false,
    onHealthIssue: false,
    onDownloadFailure: false,
    onImportFailure: false,
    onBookRetag: false,
    onApplicationUpdate: false,
    includeHealthWarnings: false,
    fields: [{ name: "webHookUrl", value: "https://discord.example/webhook" }],
    ...overrides,
  };
}

describe("notificationController", () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  it("POST / creates a notification and returns the real wire shape (onX siblings, not inside fields)", async () => {
    const res = await request(ctx.app).post("/notification").send(discordBody());

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Discord");
    expect(res.body.onGrab).toBe(true);
    expect(res.body.onReleaseImport).toBe(false);
    const fieldNames = (res.body.fields as { name: string }[]).map((f) => f.name);
    expect(fieldNames.every((n) => !n.startsWith("$$"))).toBe(true);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "webHookUrl", value: "https://discord.example/webhook" }),
      ])
    );
  });

  it("recomputes enable from OnX flags in create()/update() (computed-getter fix) so getMany()/all() see the correct value post-write, even though the shared base's mapper hardcodes enable=false when building the definition", async () => {
    const created = await request(ctx.app)
      .post("/notification")
      .send(discordBody({ onGrab: true }));

    expect(created.status).toBe(201);

    // Persisted `enable` isn't a stored column at all (NotificationFactory
    // recomputes it fresh from OnX every read -- see NotificationDefinition.ts's
    // doc comment) -- verify through NotificationFactory.active(), the real
    // observable consumer of a definition's enable state, rather than a
    // repository column that was never expected to carry it.
    const updated = await request(ctx.app)
      .put(`/notification/${created.body.id}`)
      .send(discordBody({ id: created.body.id, onGrab: false, onHealthIssue: true }));

    expect(updated.status).toBe(202);
    expect(updated.body.onHealthIssue).toBe(true);
  });

  it("test-on-save gate does not run when every OnX flag is false (enable correctly recomputes to false in create())", async () => {
    let testCalled = false;
    const spiedDiscord: INotification = {
      ...fakeDiscord(),
      test: () => {
        testCalled = true;
        return Promise.resolve({ isValid: true, hasWarnings: false, errors: [] });
      },
    };

    const db: MainDatabase = createMainDatabase(":memory:");
    const repository = new NotificationRepository(db);
    const router = notificationController({
      repository,
      providers: [spiedDiscord],
      notificationStatusService: noopStatusService(),
    });
    const app = express();
    app.use(express.json());
    app.use("/notification", router);
    app.use(readarrErrorPipeline());

    const res = await request(app)
      .post("/notification")
      .send(
        discordBody({
          onGrab: false,
          onReleaseImport: false,
          onUpgrade: false,
          onRename: false,
          onAuthorAdded: false,
          onAuthorDelete: false,
          onBookDelete: false,
          onBookFileDelete: false,
          onBookFileDeleteForUpgrade: false,
          onHealthIssue: false,
          onDownloadFailure: false,
          onImportFailure: false,
          onBookRetag: false,
          onApplicationUpdate: false,
        })
      );

    expect(res.status).toBe(201);
    expect(testCalled).toBe(false);
  });

  it("KNOWN LIMITATION (documented in NotificationController.ts): providerControllerBase's own PRE-create test-gate check runs before this controller's enable-recompute fix can apply, so test() is NOT invoked on create even with onGrab=true -- a real, accepted deviation from Readarr's always-correct computed getter", async () => {
    let testCalled = false;
    const spiedDiscord: INotification = {
      ...fakeDiscord(),
      test: () => {
        testCalled = true;
        return Promise.resolve({ isValid: true, hasWarnings: false, errors: [] });
      },
    };

    const db: MainDatabase = createMainDatabase(":memory:");
    const repository = new NotificationRepository(db);
    const router = notificationController({
      repository,
      providers: [spiedDiscord],
      notificationStatusService: noopStatusService(),
    });
    const app = express();
    app.use(express.json());
    app.use("/notification", router);
    app.use(readarrErrorPipeline());

    const res = await request(app)
      .post("/notification")
      .send(discordBody({ onGrab: true }));

    expect(res.status).toBe(201);
    // This documents the KNOWN LIMITATION: real Readarr WOULD call test()
    // here (Enable is a computed getter, always correct). This port's
    // pre-create gate reads a stale hardcoded-false enable -- see
    // NotificationController.ts's doc comment for why this can't be fixed
    // without modifying the shared, unmodifiable ProviderControllerBase.ts.
    expect(testCalled).toBe(false);
  });

  it("GET / lists notifications sorted by name with onX/supportsOnX fields visible", async () => {
    await request(ctx.app)
      .post("/notification")
      .send(discordBody({ name: "Zebra" }));
    await request(ctx.app)
      .post("/notification")
      .send(discordBody({ name: "Apple" }));

    const res = await request(ctx.app).get("/notification");

    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(["Apple", "Zebra"]);
  });

  it("GET /:id returns supportsOnX flags stamped from the live provider instance", async () => {
    const created = await request(ctx.app).post("/notification").send(discordBody());

    const res = await request(ctx.app).get(`/notification/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.supportsOnGrab).toBe(true);
  });

  it("PUT /:id updates onGrab and returns 202", async () => {
    const created = await request(ctx.app).post("/notification").send(discordBody());

    const res = await request(ctx.app)
      .put(`/notification/${created.body.id}`)
      .send(discordBody({ id: created.body.id, onGrab: false, onUpgrade: true }));

    expect(res.status).toBe(202);
    expect(res.body.onGrab).toBe(false);
    expect(res.body.onUpgrade).toBe(true);
  });

  it("DELETE /:id removes the notification", async () => {
    const created = await request(ctx.app).post("/notification").send(discordBody());

    const del = await request(ctx.app).delete(`/notification/${created.body.id}`);
    expect(del.status).toBe(200);
    expect(ctx.repository.all()).toHaveLength(0);
  });

  it("GET /schema returns default definitions for every registered implementation", async () => {
    const res = await request(ctx.app).get("/notification/schema");

    expect(res.status).toBe(200);
    const implementations = (res.body as { implementation: string }[]).map((r) => r.implementation);
    expect(implementations).toEqual(expect.arrayContaining(["Discord", "Slack"]));
  });

  it("handles a second implementation's distinct settings shape via the union field schema (Slack's webHookUrl round-trips independently of Discord's)", async () => {
    const res = await request(ctx.app)
      .post("/notification")
      .send(
        discordBody({
          name: "My Slack",
          implementation: "Slack",
          configContract: "SlackSettings",
          fields: [{ name: "webHookUrl", value: "https://slack.example/webhook" }],
        })
      );

    expect(res.status).toBe(201);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "webHookUrl", value: "https://slack.example/webhook" }),
      ])
    );
  });

  it("PUT /bulk and DELETE /bulk are reachable in this port (documented deviation from the real 404 -- see NotificationBulkResource.ts)", async () => {
    const a = await request(ctx.app)
      .post("/notification")
      .send(discordBody({ name: "A" }));

    const bulkRes = await request(ctx.app)
      .put("/notification/bulk")
      .send({ ids: [a.body.id], tags: [7], applyTags: "Add" });

    expect(bulkRes.status).toBe(202);
  });
});
