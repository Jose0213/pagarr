import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ConfigService } from "../../../../config/configService.js";
import { ConfigRepository } from "../../../../config/configRepository.js";
import { InMemoryKeyValueRepository } from "../../../../config/keyValueRepository.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import {
  mediaManagementConfigController,
  mediaManagementConfigSharedValidator,
} from "../MediaManagementConfigResource.js";

function makeApp() {
  const kv = new InMemoryKeyValueRepository();
  const repository = new ConfigRepository(kv);
  const configService = new ConfigService(repository);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/config/mediamanagement", mediaManagementConfigController(configService));
  app.use(readarrErrorPipeline());

  return { app, configService };
}

const validBody = {
  id: 1,
  autoUnmonitorPreviouslyDownloadedBooks: false,
  recycleBin: "",
  recycleBinCleanupDays: 7,
  downloadPropersAndRepacks: "PreferAndUpgrade",
  createEmptyAuthorFolders: false,
  deleteEmptyFolders: false,
  fileDate: "None",
  watchLibraryForChanges: true,
  rescanAfterRefresh: "Always",
  allowFingerprinting: "NewFiles",
  setPermissionsLinux: false,
  chmodFolder: "755",
  chownGroup: "",
  skipFreeSpaceCheckWhenImporting: false,
  minimumFreeSpaceWhenImporting: 100,
  copyUsingHardlinks: true,
  importExtraFiles: false,
  extraFileExtensions: "srt",
};

describe("mediaManagementConfigController", () => {
  it("GET / returns defaults", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/v1/config/mediamanagement");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.minimumFreeSpaceWhenImporting).toBe(100);
    expect(res.body.copyUsingHardlinks).toBe(true);
  });

  it("PUT persists valid values", async () => {
    const { app, configService } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/mediamanagement/1")
      .send({ ...validBody, recycleBinCleanupDays: 14 });

    expect(res.status).toBe(202);
    expect(configService.recycleBinCleanupDays).toBe(14);
  });

  it("PUT rejects minimumFreeSpaceWhenImporting < 100", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .put("/api/v1/config/mediamanagement/1")
      .send({ ...validBody, minimumFreeSpaceWhenImporting: 50 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual([
      {
        propertyName: "minimumFreeSpaceWhenImporting",
        errorMessage: "'Minimum Free Space When Importing' must be greater than or equal to '100'.",
      },
    ]);
  });
});

describe("mediaManagementConfigSharedValidator", () => {
  it("rejects a non-empty recycleBin that isn't a valid path", () => {
    const failures = mediaManagementConfigSharedValidator({
      ...validBody,
      recycleBin: "not a path",
    } as never);

    expect(failures.some((f) => f.propertyName === "recycleBin")).toBe(true);
  });

  it("allows an empty recycleBin (nothing configured)", () => {
    const failures = mediaManagementConfigSharedValidator(validBody as never);
    expect(failures.some((f) => f.propertyName === "recycleBin")).toBe(false);
  });

  it("rejects negative recycleBinCleanupDays", () => {
    const failures = mediaManagementConfigSharedValidator({
      ...validBody,
      recycleBinCleanupDays: -1,
    } as never);

    expect(failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ propertyName: "recycleBinCleanupDays" })])
    );
  });
});
