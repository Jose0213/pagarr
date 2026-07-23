import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ImageResizer, type DiskProviderLike } from "../imageResizer.js";

/**
 * Ported from NzbDrone.Core.Test/MediaCoverTests/ImageResizerFixture.cs.
 *
 * The C# fixture copies a real 1024x1024 PNG fixture file
 * (`Files/1024.png`) from the test tree. No binary fixture exists in this
 * port's reference source checkout (only .cs files were cloned), so this
 * test generates an equivalent 1024x1024 PNG at runtime via `sharp` itself
 * -- exercising the exact same "resize a real square PNG to height 170,
 * expect 170x170 output" behavior the original asserts, without checking a
 * binary fixture into this port's source tree.
 */
describe("ImageResizer", () => {
  let tempFolder: string;
  let realDiskProvider: DiskProviderLike;

  beforeEach(() => {
    tempFolder = mkdtempSync(join(tmpdir(), "pagarr-imageresizer-"));
    realDiskProvider = {
      fileExists: (path: string) => existsSync(path),
      deleteFile: (path: string) => {
        try {
          rmSync(path, { force: true });
        } catch {
          // ignore
        }
      },
    };
  });

  afterEach(() => {
    rmSync(tempFolder, { recursive: true, force: true });
  });

  it("should_resize_image", async () => {
    const mainFile = join(tempFolder, "logo.png");
    const resizedFile = join(tempFolder, "logo-170.png");

    const sourceBuffer = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: { r: 100, g: 120, b: 140 } },
    })
      .png()
      .toBuffer();
    writeFileSync(mainFile, sourceBuffer);

    const subject = new ImageResizer(realDiskProvider);
    await subject.resize(mainFile, resizedFile, 170);

    expect(existsSync(resizedFile)).toBe(true);
    const stat = statSync(resizedFile);
    expect(stat.size).toBeGreaterThan(0);

    const metadata = await sharp(resizedFile).metadata();
    expect(metadata.height).toBe(170);
    expect(metadata.width).toBe(170);
  });

  it("should_delete_file_if_failed", async () => {
    const mainFile = join(tempFolder, "junk.png");
    const resizedFile = join(tempFolder, "junk-170.png");

    writeFileSync(mainFile, "Just some junk data that should make it throw an Exception.");

    const subject = new ImageResizer(realDiskProvider);

    await expect(subject.resize(mainFile, resizedFile, 170)).rejects.toBeTruthy();

    expect(existsSync(resizedFile)).toBe(false);
  });

  it("deletes a partially-written destination file on failure via the injected disk provider", async () => {
    const mainFile = join(tempFolder, "junk2.png");
    const resizedFile = join(tempFolder, "junk2-170.png");
    writeFileSync(mainFile, "not an image");
    // Simulate the destination having already been created by a prior partial write.
    writeFileSync(resizedFile, "partial");

    const deleteFile = vi.fn((path: string) => rmSync(path, { force: true }));
    const diskProvider: DiskProviderLike = {
      fileExists: (path: string) => existsSync(path),
      deleteFile,
    };

    const subject = new ImageResizer(diskProvider);
    await expect(subject.resize(mainFile, resizedFile, 170)).rejects.toBeTruthy();

    expect(deleteFile).toHaveBeenCalledWith(resizedFile);
  });
});
