import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FileNameBuilder } from "../../../../media-files-organize/organizer/fileNameBuilder.js";
import { FileNameSampleService } from "../../../../media-files-organize/organizer/fileNameSampleService.js";
import { FileNameValidationService } from "../../../../media-files-organize/organizer/fileNameValidationService.js";
import type { INamingConfigService } from "../../../../media-files-organize/organizer/namingConfigService.js";
import {
  newNamingConfigDefault,
  type NamingConfig,
} from "../../../../media-files-organize/organizer/namingConfig.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { namingConfigController, namingConfigSharedValidator } from "../NamingConfigResource.js";

class FakeNamingConfigService implements INamingConfigService {
  private config: NamingConfig = { ...newNamingConfigDefault(), id: 1 };

  getConfig(): NamingConfig {
    return this.config;
  }
  save(namingConfig: NamingConfig): void {
    this.config = namingConfig;
  }
}

function makeDeps() {
  const namingConfigService = new FakeNamingConfigService();
  // FileNameBuilder needs `getConfig()` for its own internal calls, plus a
  // no-op quality/custom-format lookup -- these test paths never reach
  // token replacement for a blank/simple pattern.
  const filenameBuilder = new FileNameBuilder(
    namingConfigService,
    { get: () => ({ title: "" }) },
    { parseCustomFormatForBookFile: () => [] }
  );
  const filenameSampleService = new FileNameSampleService(filenameBuilder);
  const filenameValidationService = new FileNameValidationService();

  return { namingConfigService, filenameSampleService, filenameValidationService, filenameBuilder };
}

function makeApp() {
  const deps = makeDeps();

  const app = express();
  app.use(express.json());
  app.use("/api/v1/config/naming", namingConfigController(deps));
  app.use(readarrErrorPipeline());

  return { app, ...deps };
}

describe("namingConfigController", () => {
  it("GET / returns the naming config, with basic-naming fields blank when StandardBookFormat is blank", async () => {
    const { app, namingConfigService } = makeApp();
    namingConfigService.save({ ...newNamingConfigDefault(), id: 1, standardBookFormat: "" });

    const res = await request(app).get("/api/v1/config/naming");

    expect(res.status).toBe(200);
    expect(res.body.standardBookFormat).toBe("");
    // Ported: AddToResource only runs when StandardBookFormat is non-blank.
    expect(res.body.includeAuthorName).toBe(false);
  });

  it("GET / adds basic-naming fields when StandardBookFormat is non-blank", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/naming");

    expect(res.status).toBe(200);
    // Default StandardBookFormat is non-blank (see namingConfig.ts's newNamingConfigDefault).
    expect(typeof res.body.includeAuthorName).toBe("boolean");
  });

  it("GET /:id returns the same singleton", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/naming/999");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("PUT persists via namingConfigService.save", async () => {
    const { app, namingConfigService } = makeApp();

    const res = await request(app).put("/api/v1/config/naming/1").send({
      id: 1,
      renameBooks: true,
      replaceIllegalCharacters: true,
      colonReplacementFormat: 4,
      standardBookFormat: "{Author Name} - {Book Title} {(PartNumber)}",
      authorFolderFormat: "{Author Name}",
    });

    expect(res.status).toBe(202);
    expect(namingConfigService.getConfig().renameBooks).toBe(true);
  });

  it("PUT rejects a StandardBookFormat missing Book Title/PartNumber and Original Title tokens", async () => {
    const { app } = makeApp();

    const res = await request(app).put("/api/v1/config/naming/1").send({
      id: 1,
      renameBooks: true,
      replaceIllegalCharacters: true,
      colonReplacementFormat: 4,
      standardBookFormat: "just some text",
      authorFolderFormat: "{Author Name}",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual([
      {
        propertyName: "standardBookFormat",
        errorMessage: "Must contain Book Title AND PartNumber, OR Original Title",
      },
    ]);
  });

  it("PUT rejects an AuthorFolderFormat missing the Author Name token", async () => {
    const { app } = makeApp();

    const res = await request(app).put("/api/v1/config/naming/1").send({
      id: 1,
      renameBooks: true,
      replaceIllegalCharacters: true,
      colonReplacementFormat: 4,
      standardBookFormat: "{Author Name} - {Book Title} {(PartNumber)}",
      authorFolderFormat: "no token here",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual([
      { propertyName: "authorFolderFormat", errorMessage: "Must contain Author name" },
    ]);
  });

  it("GET /examples returns sample filenames when config.id is 0/absent (uses the current saved config)", async () => {
    const { app, namingConfigService } = makeApp();
    namingConfigService.save({
      ...newNamingConfigDefault(),
      id: 1,
      standardBookFormat: "{Author Name} - {Book Title} {(PartNumber)}",
      authorFolderFormat: "{Author Name}",
    });

    const res = await request(app).get("/api/v1/config/naming/examples");

    expect(res.status).toBe(200);
    expect(typeof res.body.singleBookExample).toBe("string");
    expect(typeof res.body.authorFolderExample).toBe("string");
  });

  it("GET /examples returns null authorFolderExample when AuthorFolderFormat is blank (id != 0 selects the query-driven config, not the saved one)", async () => {
    const { app } = makeApp();

    const res = await request(app).get(
      "/api/v1/config/naming/examples?id=5&standardBookFormat=%7BAuthor%20Name%7D%20-%20%7BBook%20Title%7D%20%7B(PartNumber)%7D&authorFolderFormat="
    );

    expect(res.status).toBe(200);
    expect(res.body.authorFolderExample).toBeNull();
  });
});

describe("namingConfigSharedValidator", () => {
  it("accepts a config with valid StandardBookFormat and AuthorFolderFormat", () => {
    const failures = namingConfigSharedValidator({
      id: 1,
      renameBooks: true,
      replaceIllegalCharacters: true,
      colonReplacementFormat: 4,
      standardBookFormat: "{Author Name} - {Book Title} {(PartNumber)}",
      authorFolderFormat: "{Author Name}",
      includeAuthorName: false,
      includeBookTitle: false,
      includeQuality: false,
      replaceSpaces: false,
      separator: "",
      numberStyle: null,
    });

    expect(failures).toEqual([]);
  });
});
