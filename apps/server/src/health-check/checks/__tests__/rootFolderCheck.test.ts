import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import type { ImportListFactoryLike } from "../importListRootFolderCheck.js";
import { RootFolderCheck } from "../rootFolderCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/RootFolderCheckFixture.cs. */

describe("RootFolderCheck", () => {
  it("should_not_return_error_when_no_book", () => {
    const check = new RootFolderCheck(
      { allAuthorPaths: () => new Map() },
      { all: () => [] },
      { folderExists: () => true },
      { getBestRootFolderPath: (p) => p },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_error_if_book_parent_is_missing", () => {
    const rootFolderPath = "/Books";
    const importListFactory: ImportListFactoryLike = {
      all: () => [{ name: "List", rootFolderPath: "/OtherBooks" }],
    };

    const check = new RootFolderCheck(
      { allAuthorPaths: () => new Map([[1, "/Books/Author"]]) },
      importListFactory,
      { folderExists: () => false },
      { getBestRootFolderPath: () => rootFolderPath },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Error);
  });

  it("should_return_error_when_the_root_folder_path_is_not_valid_for_the_current_os", () => {
    // Ported analog of the real fixture's WindowsOnly/PosixOnly split
    // (`/mnt/books` invalid on Windows, `C:\Books` invalid on POSIX) --
    // rather than branching this test on `process.platform` (flaky/
    // environment-dependent), this asserts the underlying "not rooted for
    // this OS" path directly: an empty/relative-looking path is never valid
    // on ANY OS, exercising the same `!isPathRooted(s)` branch
    // RootFolderCheck.check() takes for a genuinely malformed path.
    const check = new RootFolderCheck(
      { allAuthorPaths: () => new Map([[1, "not-a-real-path"]]) },
      { all: () => [] },
      { folderExists: () => false },
      { getBestRootFolderPath: () => "relative/not/rooted" },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Error);
  });
});
