import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { MountCheck, type MountLike } from "../mountCheck.js";

/** New tests -- no dedicated C# fixture exists for MountCheck in the real HealthCheck test suite. */

describe("MountCheck", () => {
  it("returns Ok when the author has no mount at all", () => {
    const check = new MountCheck(
      { getMount: () => null },
      { allAuthorPaths: () => new Map([[1, "/Books/Author"]]) },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Ok when the mount is writable", () => {
    const mount: MountLike = {
      name: "/dev/sda1",
      rootDirectory: "/",
      mountOptions: { isReadOnly: false },
    };
    const check = new MountCheck(
      { getMount: () => mount },
      { allAuthorPaths: () => new Map([[1, "/Books/Author"]]) },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Error naming a read-only mount", () => {
    const mount: MountLike = {
      name: "/dev/sda1",
      rootDirectory: "/",
      mountOptions: { isReadOnly: true },
    };
    const check = new MountCheck(
      { getMount: () => mount },
      { allAuthorPaths: () => new Map([[1, "/Books/Author"]]) },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.message).toContain("/dev/sda1");
  });

  it("de-duplicates multiple authors sharing the same read-only mount root", () => {
    const mount: MountLike = {
      name: "/dev/sda1",
      rootDirectory: "/",
      mountOptions: { isReadOnly: true },
    };
    const check = new MountCheck(
      { getMount: () => mount },
      {
        allAuthorPaths: () =>
          new Map([
            [1, "/Books/Author1"],
            [2, "/Books/Author2"],
          ]),
      },
      new NullLocalizationService()
    );

    const result = check.check();
    // Only one occurrence of the mount name even though two authors share it.
    expect(result.message!.split("/dev/sda1")).toHaveLength(2);
  });
});
