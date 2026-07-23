import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { CleanupTemporaryUpdateFiles } from "../housekeepers/cleanupTemporaryUpdateFiles.js";
import type { IHousekeepingDiskProvider } from "../diskProvider.js";

/** Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupTemporaryUpdateFiles.cs. */
describe("CleanupTemporaryUpdateFiles", () => {
  function makeDiskProvider(folderExists: boolean): {
    provider: IHousekeepingDiskProvider;
    deleteFolder: ReturnType<typeof vi.fn>;
  } {
    const deleteFolder = vi.fn();
    const provider = {
      folderExists: vi.fn().mockReturnValue(folderExists),
      deleteFolder,
      fileExists: vi.fn(),
      deleteFile: vi.fn(),
      readHeaderBytes: vi.fn(),
    } as IHousekeepingDiskProvider;
    return { provider, deleteFolder };
  }

  it("deletes the update sandbox folder (recursively) when it exists", () => {
    const { provider, deleteFolder } = makeDiskProvider(true);

    new CleanupTemporaryUpdateFiles(provider, { tempFolder: "/tmp" }).clean();

    expect(deleteFolder).toHaveBeenCalledTimes(1);
    const [path, recursive] = deleteFolder.mock.calls[0]!;
    expect(path).toContain("readarr_update");
    expect(recursive).toBe(true);
  });

  it("does nothing when the update sandbox folder doesn't exist", () => {
    const { provider, deleteFolder } = makeDiskProvider(false);

    new CleanupTemporaryUpdateFiles(provider, { tempFolder: "/tmp" }).clean();

    expect(deleteFolder).not.toHaveBeenCalled();
  });

  it("builds the sandbox folder path by combining the app folder info's tempFolder with 'readarr_update'", () => {
    const { provider, deleteFolder } = makeDiskProvider(true);

    new CleanupTemporaryUpdateFiles(provider, { tempFolder: "/custom/temp" }).clean();

    const [path] = deleteFolder.mock.calls[0]!;
    expect(path).toBe(join("/custom/temp", "readarr_update"));
  });
});
