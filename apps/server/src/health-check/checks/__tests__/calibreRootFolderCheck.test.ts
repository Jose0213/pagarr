import { describe, expect, it } from "vitest";
import type { RootFolder, CalibreSettings } from "../../../root-folders/root-folder.js";
import { DownloadClientException } from "../../../download-clients/DownloadClientException.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { CalibreRootFolderCheck, type CalibreProxyLike } from "../calibreRootFolderCheck.js";

/** New tests -- no dedicated C# fixture exists for CalibreRootFolderCheck. */

const CALIBRE_SETTINGS: CalibreSettings = {
  host: "localhost",
  port: 8080,
  urlBase: null,
  username: null,
  password: null,
  library: "Default",
  outputFormat: "epub",
  outputProfile: 0,
  useSsl: false,
};

function calibreRootFolder(overrides: Partial<RootFolder> = {}): RootFolder {
  return {
    id: 1,
    name: "Calibre",
    path: "/Books/CalibreLib",
    defaultMetadataProfileId: 0,
    defaultQualityProfileId: 0,
    defaultMonitorOption: 0,
    defaultNewItemMonitorOption: 0,
    defaultTags: new Set(),
    isCalibreLibrary: true,
    calibreSettings: CALIBRE_SETTINGS,
    accessible: true,
    freeSpace: null,
    totalSpace: null,
    ...overrides,
  };
}

describe("CalibreRootFolderCheck", () => {
  it("returns Ok when there are no calibre root folders", () => {
    const check = new CalibreRootFolderCheck(
      { folderExists: () => true, fileExists: () => true },
      { all: () => [] },
      { getAllBookFilePaths: () => [] },
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Ok when calibre reports no files yet", () => {
    const check = new CalibreRootFolderCheck(
      { folderExists: () => true, fileExists: () => true },
      { all: () => [calibreRootFolder()] },
      { getAllBookFilePaths: () => [] },
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Ok when calibre's reported library folder matches the root folder path exactly", () => {
    const check = new CalibreRootFolderCheck(
      { folderExists: () => true, fileExists: () => true },
      { all: () => [calibreRootFolder({ path: "/Books/CalibreLib" })] },
      {
        getAllBookFilePaths: () => ["/Books/CalibreLib/Author/Book/file.epub"],
      },
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Error when calibre's library folder does not exist on disk (local calibre -> permissions-error)", () => {
    const check = new CalibreRootFolderCheck(
      { folderExists: () => false, fileExists: () => true },
      { all: () => [calibreRootFolder({ path: "/Books/CalibreLib" })] },
      {
        getAllBookFilePaths: () => ["/Books/CalibreLib/Author/Book/file.epub"],
      },
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("permissions-error");
  });

  it("returns Error when a REMOTE calibre's library folder does not exist on disk (bad-remote-path-mapping)", () => {
    const remoteSettings: CalibreSettings = { ...CALIBRE_SETTINGS, host: "calibre.example.com" };
    const check = new CalibreRootFolderCheck(
      { folderExists: () => false, fileExists: () => true },
      {
        all: () => [
          calibreRootFolder({ path: "/Books/CalibreLib", calibreSettings: remoteSettings }),
        ],
      },
      {
        getAllBookFilePaths: () => ["/Books/CalibreLib/Author/Book/file.epub"],
      },
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("bad-remote-path-mapping");
  });

  it("returns Error when calibre's reported file does not exist on disk", () => {
    const check = new CalibreRootFolderCheck(
      { folderExists: () => true, fileExists: () => false },
      { all: () => [calibreRootFolder({ path: "/Books/CalibreLib" })] },
      {
        getAllBookFilePaths: () => ["/Books/CalibreLib/Author/Book/file.epub"],
      },
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("permissions-error");
  });

  it("returns Error when calibre's library folder does not match the configured root folder path", () => {
    const check = new CalibreRootFolderCheck(
      { folderExists: () => true, fileExists: () => true },
      { all: () => [calibreRootFolder({ path: "/Books/SomewhereElse" })] },
      {
        getAllBookFilePaths: () => ["/Books/CalibreLib/Author/Book/file.epub"],
      },
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.wikiUrl!.toString()).toContain("calibre-root-does-not-match");
  });

  it("ignores non-calibre root folders", () => {
    const nonCalibre = calibreRootFolder({ isCalibreLibrary: false, path: "/Books/Regular" });
    const check = new CalibreRootFolderCheck(
      { folderExists: () => false, fileExists: () => false },
      { all: () => [nonCalibre] },
      { getAllBookFilePaths: () => [] },
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("logs but does not error when the calibre proxy throws DownloadClientException", () => {
    const throwingProxy: CalibreProxyLike = {
      getAllBookFilePaths: () => {
        throw new DownloadClientException("unreachable");
      },
    };

    const check = new CalibreRootFolderCheck(
      { folderExists: () => true, fileExists: () => true },
      { all: () => [calibreRootFolder()] },
      throwingProxy,
      { name: "Linux", isDocker: false },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });
});
