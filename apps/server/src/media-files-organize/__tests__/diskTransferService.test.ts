import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExtendedDiskProvider } from "../diskProvider.js";
import { DiskTransferService, TransferMode } from "../diskTransferService.js";
import { DestinationAlreadyExistsException } from "../errors.js";

/**
 * New tests covering the ported slice of DiskTransferServiceFixture's
 * behavior this module actually depends on: verified move/copy (size-check
 * after transfer), same-path rejection, destination-already-exists
 * behavior, and the destination-cannot-be-a-child-of-source guard.
 */
describe("DiskTransferService", () => {
  let tmpDir: string;
  let provider: ExtendedDiskProvider;
  let service: DiskTransferService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-transfer-test-"));
    provider = new ExtendedDiskProvider();
    service = new DiskTransferService(provider);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("transferFile with Move relocates the file and removes the source", () => {
    const source = join(tmpDir, "source.mp3");
    const dest = join(tmpDir, "dest.mp3");
    writeFileSync(source, "audio-bytes");

    const result = service.transferFile(source, dest, TransferMode.Move);

    expect(result).toBe(TransferMode.Move);
    expect(existsSync(source)).toBe(false);
    expect(readFileSync(dest, "utf8")).toBe("audio-bytes");
  });

  it("transferFile with Copy duplicates without removing the source", () => {
    const source = join(tmpDir, "source.mp3");
    const dest = join(tmpDir, "dest.mp3");
    writeFileSync(source, "audio-bytes");

    const result = service.transferFile(source, dest, TransferMode.Copy);

    expect(result).toBe(TransferMode.Copy);
    expect(existsSync(source)).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("audio-bytes");
  });

  it("transferFile throws when source path does not exist", () => {
    expect(() =>
      service.transferFile(join(tmpDir, "missing.mp3"), join(tmpDir, "dest.mp3"), TransferMode.Move)
    ).toThrow("Book file path does not exist");
  });

  it("transferFile throws when source and destination are the identical string", () => {
    const source = join(tmpDir, "source.mp3");
    writeFileSync(source, "x");

    expect(() => service.transferFile(source, source, TransferMode.Move)).toThrow(
      "can't be the same"
    );
  });

  it("transferFile throws DestinationAlreadyExistsException without overwrite", () => {
    const source = join(tmpDir, "source.mp3");
    const dest = join(tmpDir, "dest.mp3");
    writeFileSync(source, "new");
    writeFileSync(dest, "old");

    expect(() => service.transferFile(source, dest, TransferMode.Move, false)).toThrow(
      DestinationAlreadyExistsException
    );
  });

  it("transferFile overwrites an existing destination when overwrite=true", () => {
    const source = join(tmpDir, "source.mp3");
    const dest = join(tmpDir, "dest.mp3");
    writeFileSync(source, "new");
    writeFileSync(dest, "old");

    service.transferFile(source, dest, TransferMode.Move, true);

    expect(readFileSync(dest, "utf8")).toBe("new");
  });

  it("transferFile rejects a destination nested under the source path", () => {
    const source = join(tmpDir, "sourcedir");
    writeFileSync(source, "not actually a dir, just testing the string check"); // sourcePath used as prefix check only

    const childPath = join(source, "nested", "dest.mp3");

    expect(() => service.transferFile(source, childPath, TransferMode.Copy)).toThrow(
      "cannot be a child of the source"
    );
  });

  it("transferFolder moves an entire directory tree", () => {
    const sourceDir = join(tmpDir, "src");
    const destDir = join(tmpDir, "dst");
    writeFileSync(joinMk(sourceDir, "a.mp3"), "1");
    writeFileSync(joinMk(join(sourceDir, "nested"), "b.mp3"), "2");

    service.transferFolder(sourceDir, destDir, TransferMode.Move);

    expect(existsSync(sourceDir)).toBe(false);
    expect(existsSync(join(destDir, "a.mp3"))).toBe(true);
    expect(existsSync(join(destDir, "nested", "b.mp3"))).toBe(true);
  });
});

function joinMk(dir: string, file: string): string {
  const provider = new ExtendedDiskProvider();
  provider.createFolder(dir);
  return join(dir, file);
}
