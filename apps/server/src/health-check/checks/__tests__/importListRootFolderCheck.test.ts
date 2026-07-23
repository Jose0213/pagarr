import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { ImportListRootFolderCheck } from "../importListRootFolderCheck.js";

/** New tests -- no dedicated C# fixture exists for ImportListRootFolderCheck. */

describe("ImportListRootFolderCheck", () => {
  it("returns Ok when there are no import lists", () => {
    const check = new ImportListRootFolderCheck(
      { all: () => [] },
      { folderExists: () => true },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Ok when every import list's root folder exists", () => {
    const check = new ImportListRootFolderCheck(
      { all: () => [{ name: "List1", rootFolderPath: "/Books" }] },
      { folderExists: () => true },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Error naming the single missing root folder", () => {
    const check = new ImportListRootFolderCheck(
      { all: () => [{ name: "List1", rootFolderPath: "/Missing" }] },
      { folderExists: () => false },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("import-list-missing-root-folder");
  });

  it("returns Error with the multiple-missing wiki fragment when several distinct root folders are missing", () => {
    const check = new ImportListRootFolderCheck(
      {
        all: () => [
          { name: "List1", rootFolderPath: "/Missing1" },
          { name: "List2", rootFolderPath: "/Missing2" },
        ],
      },
      { folderExists: () => false },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("import_list_missing_root_folder");
  });

  it("does not double-count two import lists sharing the same missing root folder", () => {
    let folderExistsCalls = 0;
    const check = new ImportListRootFolderCheck(
      {
        all: () => [
          { name: "List1", rootFolderPath: "/Missing" },
          { name: "List2", rootFolderPath: "/Missing" },
        ],
      },
      {
        folderExists: () => {
          folderExistsCalls++;
          return false;
        },
      },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("import-list-missing-root-folder");
    expect(folderExistsCalls).toBe(1);
  });
});
