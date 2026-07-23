import { describe, expect, it, vi } from "vitest";
import { MetadataTagService } from "../metadataTagService.js";
import type { AudioTagService } from "../audioTagService.js";
import type { EbookTagService } from "../ebookTagService.js";
import type { BookFileRef } from "../audioTagTypes.js";
import type { ParsedTrackInfo } from "../../parser/model/parsedTrackInfo.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/MetadataTagService.cs's dispatch
 * logic (audio-extension routes to AudioTagService, else EBookTagService;
 * WriteTags additionally gates ebook writes on CalibreId > 0). No C# unit
 * test fixture exists for MetadataTagService.cs itself.
 */

function makeMocks() {
  const audioTagService = {
    readTags: vi.fn(() => ({ title: "audio" }) as unknown as ParsedTrackInfo),
    writeTags: vi.fn(),
    syncTags: vi.fn(),
    getRetagPreviewsByAuthor: vi.fn(() => []),
    getRetagPreviewsByBook: vi.fn(() => []),
    retagFiles: vi.fn(),
    retagAuthor: vi.fn(),
  } as unknown as AudioTagService;

  const ebookTagService = {
    readTags: vi.fn(() => ({ title: "ebook" }) as unknown as ParsedTrackInfo),
    writeTags: vi.fn(),
    syncTags: vi.fn(),
    getRetagPreviewsByAuthor: vi.fn(() => []),
    getRetagPreviewsByBook: vi.fn(() => []),
    retagFiles: vi.fn(),
    retagAuthor: vi.fn(),
  } as unknown as EbookTagService;

  return { audioTagService, ebookTagService };
}

describe("MetadataTagService.readTags", () => {
  it("routes audio extensions to AudioTagService", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    const service = new MetadataTagService(audioTagService, ebookTagService);

    const result = service.readTags("/music/track.mp3");

    expect(audioTagService.readTags).toHaveBeenCalledWith("/music/track.mp3");
    expect(ebookTagService.readTags).not.toHaveBeenCalled();
    expect(result).toEqual({ title: "audio" });
  });

  it("routes non-audio extensions to EBookTagService", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    const service = new MetadataTagService(audioTagService, ebookTagService);

    const result = service.readTags("/books/book.epub");

    expect(ebookTagService.readTags).toHaveBeenCalledWith("/books/book.epub");
    expect(audioTagService.readTags).not.toHaveBeenCalled();
    expect(result).toEqual({ title: "ebook" });
  });
});

describe("MetadataTagService.writeTags", () => {
  it("routes audio files to AudioTagService.writeTags unconditionally", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    const service = new MetadataTagService(audioTagService, ebookTagService);
    const file = { path: "/music/track.flac", calibreId: 0 } as BookFileRef;

    service.writeTags(file, true, false);

    expect(audioTagService.writeTags).toHaveBeenCalledWith(file, true, false);
    expect(ebookTagService.writeTags).not.toHaveBeenCalled();
  });

  it("routes ebook files to EBookTagService.writeTags only when CalibreId > 0", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    const service = new MetadataTagService(audioTagService, ebookTagService);
    const file = { path: "/books/book.epub", calibreId: 5 } as BookFileRef;

    service.writeTags(file, false, true);

    expect(ebookTagService.writeTags).toHaveBeenCalledWith(file, false, true);
  });

  it("does not write ebook tags when CalibreId is 0", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    const service = new MetadataTagService(audioTagService, ebookTagService);
    const file = { path: "/books/book.epub", calibreId: 0 } as BookFileRef;

    service.writeTags(file, false, true);

    expect(ebookTagService.writeTags).not.toHaveBeenCalled();
    expect(audioTagService.writeTags).not.toHaveBeenCalled();
  });
});

describe("MetadataTagService retag preview aggregation", () => {
  it("concatenates previews from both services for GetRetagPreviewsByAuthor", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    (audioTagService.getRetagPreviewsByAuthor as ReturnType<typeof vi.fn>).mockReturnValue([
      { path: "a" },
    ]);
    (ebookTagService.getRetagPreviewsByAuthor as ReturnType<typeof vi.fn>).mockReturnValue([
      { path: "b" },
    ]);

    const service = new MetadataTagService(audioTagService, ebookTagService);
    const result = service.getRetagPreviewsByAuthor(1);

    expect(result).toEqual([{ path: "a" }, { path: "b" }]);
  });

  it("concatenates previews from both services for GetRetagPreviewsByBook", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    (audioTagService.getRetagPreviewsByBook as ReturnType<typeof vi.fn>).mockReturnValue([
      { path: "a" },
    ]);
    (ebookTagService.getRetagPreviewsByBook as ReturnType<typeof vi.fn>).mockReturnValue([
      { path: "b" },
    ]);

    const service = new MetadataTagService(audioTagService, ebookTagService);
    const result = service.getRetagPreviewsByBook(1);

    expect(result).toEqual([{ path: "a" }, { path: "b" }]);
  });
});

describe("MetadataTagService command execution", () => {
  it("executeRetagFiles calls EBookTagService then AudioTagService", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    const service = new MetadataTagService(audioTagService, ebookTagService);
    const message = { authorId: 1, files: [1, 2], updateCovers: true, embedMetadata: false };

    service.executeRetagFiles(message);

    expect(ebookTagService.retagFiles).toHaveBeenCalledWith(message);
    expect(audioTagService.retagFiles).toHaveBeenCalledWith(message);
  });

  it("executeRetagAuthor calls EBookTagService then AudioTagService", () => {
    const { audioTagService, ebookTagService } = makeMocks();
    const service = new MetadataTagService(audioTagService, ebookTagService);
    const message = { authorIds: [1], updateCovers: false, embedMetadata: true };

    service.executeRetagAuthor(message);

    expect(ebookTagService.retagAuthor).toHaveBeenCalledWith(message);
    expect(audioTagService.retagAuthor).toHaveBeenCalledWith(message);
  });
});
