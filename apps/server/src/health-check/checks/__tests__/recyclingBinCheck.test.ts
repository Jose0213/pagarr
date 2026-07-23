import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { RecyclingBinCheck } from "../recyclingBinCheck.js";

/** New tests -- no dedicated C# fixture exists for RecyclingBinCheck. */

describe("RecyclingBinCheck", () => {
  it("returns Ok when no recycle bin is configured", async () => {
    const check = new RecyclingBinCheck(
      { recycleBin: "" },
      { folderWritable: () => true },
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Ok);
  });

  it("returns Ok when the recycle bin is writable", async () => {
    const check = new RecyclingBinCheck(
      { recycleBin: "/RecycleBin" },
      { folderWritable: () => true },
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Ok);
  });

  it("returns Error when the recycle bin is not writable", async () => {
    const check = new RecyclingBinCheck(
      { recycleBin: "/RecycleBin" },
      { folderWritable: () => false },
      new NullLocalizationService()
    );

    const result = await check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("cannot-write-recycle-bin");
  });

  it("supports an async folderWritable implementation", async () => {
    const check = new RecyclingBinCheck(
      { recycleBin: "/RecycleBin" },
      { folderWritable: async () => false },
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Error);
  });
});
