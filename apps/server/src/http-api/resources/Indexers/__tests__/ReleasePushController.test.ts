import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { newAuthor, newBook } from "../../../../books/models.js";
import { DownloadDecision } from "../../../../decision-engine/downloadDecision.js";
import type {
  AuthorWithQualityProfile,
  RemoteBook,
} from "../../../../decision-engine/remoteBook.js";
import { createReleaseInfo } from "../../../../indexers/releaseInfo.js";
import { newQualityModel } from "../../../../qualities/qualityModel.js";
import { Quality } from "../../../../qualities/quality.js";
import { newQualityProfile } from "../../../../profiles/qualities/qualityProfile.js";
import {
  releasePushController,
  type DownloadClientFactoryLike,
  type IProcessDownloadDecisionsLike,
} from "../ReleasePushController.js";
import type {
  IProvider,
  IProviderConfig,
  IProviderFactory,
  ProviderDefinition,
} from "../../../../thingi-provider/index.js";

function makeAuthorWithProfile(): AuthorWithQualityProfile {
  return {
    ...newAuthor(),
    id: 1,
    authorMetadataId: 5,
    qualityProfile: newQualityProfile({ id: 1, items: [] }),
  };
}

function makeRemoteBook(): RemoteBook {
  return {
    release: createReleaseInfo({ guid: "PUSH-x", indexerId: 1, title: "Pushed" }),
    parsedBookInfo: {
      bookTitle: "Book",
      authorName: "Author",
      quality: newQualityModel(Quality.MOBI),
      discography: false,
      discographyStart: 0,
      discographyEnd: 0,
      releaseGroup: null,
      releaseHash: null,
      releaseVersion: null,
      releaseTitle: null,
    },
    author: makeAuthorWithProfile(),
    books: [{ ...newBook(), id: 9, title: "Book" }],
    downloadAllowed: true,
    customFormats: [],
    customFormatScore: 0,
    releaseSource: 0,
  };
}

function fakeIndexerFactory(
  definitions: ProviderDefinition<IProviderConfig>[] = []
): IProviderFactory<IProvider<IProviderConfig>, IProviderConfig> {
  return {
    all: () => definitions,
    get: (id: number) => {
      const found = definitions.find((d) => d.id === id);
      if (!found) {
        throw new Error("not found");
      }
      return found;
    },
  } as unknown as IProviderFactory<IProvider<IProviderConfig>, IProviderConfig>;
}

function buildApp(
  overrides: {
    parseSucceeds?: boolean;
    indexerFactory?: IProviderFactory<IProvider<IProviderConfig>, IProviderConfig>;
    downloadClientFactory?: DownloadClientFactoryLike;
  } = {}
) {
  const { parseSucceeds = true } = overrides;

  const decision = parseSucceeds
    ? new DownloadDecision(makeRemoteBook())
    : new DownloadDecision({
        ...makeRemoteBook(),
        parsedBookInfo: null as never,
      });

  const downloadDecisionMaker = { getRssDecision: vi.fn(() => [decision]) };
  const downloadDecisionProcessor: IProcessDownloadDecisionsLike = {
    processDecision: vi.fn(async () => {}),
  };

  const router = releasePushController({
    downloadDecisionMaker,
    downloadDecisionProcessor,
    indexerFactory: overrides.indexerFactory ?? fakeIndexerFactory(),
    downloadClientFactory: overrides.downloadClientFactory,
  });

  const app = express();
  app.use(express.json());
  app.use("/release/push", router);
  app.use(readarrErrorPipeline());

  return { app, downloadDecisionMaker, downloadDecisionProcessor };
}

function validPushBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 0,
    title: "Some.Release.Title",
    downloadUrl: "http://example.com/download.nzb",
    protocol: 1,
    publishDate: new Date().toISOString(),
    indexerId: 1,
    guid: "unused-guid",
    size: 100,
    ...overrides,
  };
}

describe("releasePushController", () => {
  it("POST / pushes a release, processes the decision, and returns the mapped resource", async () => {
    const ctx = buildApp();

    const res = await request(ctx.app).post("/release/push").send(validPushBody());

    expect(res.status).toBe(200);
    expect(ctx.downloadDecisionProcessor.processDecision).toHaveBeenCalled();
    expect(res.body.title).toBe("Pushed");
  });

  it("PostValidator rejects an empty title", async () => {
    const ctx = buildApp();

    const res = await request(ctx.app)
      .post("/release/push")
      .send(validPushBody({ title: "" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "title" })])
    );
  });

  it("PostValidator requires at least one of downloadUrl/magnetUrl", async () => {
    const ctx = buildApp();

    const res = await request(ctx.app)
      .post("/release/push")
      .send(validPushBody({ downloadUrl: "" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propertyName: "downloadUrl" }),
        expect.objectContaining({ propertyName: "magnetUrl" }),
      ])
    );
  });

  it("magnetUrl alone satisfies the downloadUrl/magnetUrl pair", async () => {
    const ctx = buildApp();

    const res = await request(ctx.app)
      .post("/release/push")
      .send(validPushBody({ downloadUrl: "", magnetUrl: "magnet:?xt=urn:btih:abc" }));

    expect(res.status).toBe(200);
  });

  it("throws a ValidationException (400) when the decision has no parsedBookInfo", async () => {
    const ctx = buildApp({ parseSucceeds: false });

    const res = await request(ctx.app).post("/release/push").send(validPushBody());

    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "title" })])
    );
  });

  it("resolves indexerId from a bare indexer name via ResolveIndexer", async () => {
    const definitions: ProviderDefinition<IProviderConfig>[] = [
      {
        id: 7,
        name: "MyIndexer",
        implementationName: "Newznab",
        implementation: "Newznab",
        configContract: null,
        enable: true,
        message: null,
        tags: [],
        settings: null,
      },
    ];
    const ctx = buildApp({ indexerFactory: fakeIndexerFactory(definitions) });

    const res = await request(ctx.app)
      .post("/release/push")
      .send(validPushBody({ indexerId: 0, indexer: "MyIndexer" }));

    expect(res.status).toBe(200);
  });

  it("resolves downloadClientId from a bare download client name", async () => {
    const downloadClientFactory: DownloadClientFactoryLike = {
      all: () => [{ id: 3, name: "MyClient" }],
    };
    const ctx = buildApp({ downloadClientFactory });

    const res = await request(ctx.app)
      .post("/release/push")
      .send(validPushBody({ downloadClientId: 0, downloadClient: "MyClient" }));

    expect(res.status).toBe(200);
    expect(ctx.downloadDecisionProcessor.processDecision).toHaveBeenCalledWith(
      expect.anything(),
      3
    );
  });
});
