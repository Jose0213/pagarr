import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteLogFilesService, emptyFolder } from "../deleteLogFilesService.js";
import { DeleteLogFilesCommand, DeleteUpdateLogFilesCommand } from "../commands.js";

describe("DeleteLogFilesService", () => {
  let tmpDir: string;
  let logFolder: string;
  let updateLogFolder: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-instrumentation-test-"));
    logFolder = join(tmpDir, "logs");
    updateLogFolder = join(tmpDir, "updatelogs");
    mkdirSync(logFolder);
    mkdirSync(updateLogFolder);
    writeFileSync(join(logFolder, "pagarr.txt"), "log contents");
    writeFileSync(join(logFolder, "pagarr.debug.txt"), "log contents");
    writeFileSync(join(updateLogFolder, "update.txt"), "update log contents");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("execute(DeleteLogFilesCommand) empties the log folder, ported from DeleteLogFilesService.Execute", () => {
    const service = new DeleteLogFilesService({ logFolder, updateLogFolder });

    service.execute(new DeleteLogFilesCommand());

    expect(readdirSync(logFolder)).toHaveLength(0);
    // Update-log folder untouched.
    expect(readdirSync(updateLogFolder)).toHaveLength(1);
  });

  it("executeUpdate(DeleteUpdateLogFilesCommand) empties the update-log folder only", () => {
    const service = new DeleteLogFilesService({ logFolder, updateLogFolder });

    service.executeUpdate(new DeleteUpdateLogFilesCommand());

    expect(readdirSync(updateLogFolder)).toHaveLength(0);
    expect(readdirSync(logFolder)).toHaveLength(2);
  });

  it("uses the injected emptyFolder function instead of the real filesystem when supplied", () => {
    const calls: string[] = [];
    const service = new DeleteLogFilesService({
      logFolder,
      updateLogFolder,
      emptyFolder: (path) => calls.push(path),
    });

    service.execute(new DeleteLogFilesCommand());
    service.executeUpdate(new DeleteUpdateLogFilesCommand());

    expect(calls).toEqual([logFolder, updateLogFolder]);
    // Real files untouched since the fake collaborator was used.
    expect(readdirSync(logFolder)).toHaveLength(2);
  });

  describe("emptyFolder (default IDiskProvider.EmptyFolder stand-in)", () => {
    it("deletes every entry inside the folder but leaves the folder itself", () => {
      const nestedDir = join(logFolder, "nested");
      mkdirSync(nestedDir);
      writeFileSync(join(nestedDir, "inner.txt"), "x");

      emptyFolder(logFolder);

      expect(existsSync(logFolder)).toBe(true);
      expect(readdirSync(logFolder)).toHaveLength(0);
    });
  });
});
