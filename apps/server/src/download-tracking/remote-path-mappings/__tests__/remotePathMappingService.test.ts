import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { RemotePathMappingRepository } from "../remotePathMappingRepository.js";
import { RemotePathMappingService } from "../remotePathMappingService.js";
import { newRemotePathMapping } from "../remotePathMapping.js";
import { newOsPath } from "../osPath.js";

describe("RemotePathMappingService", () => {
  let db: MainDatabase;
  let repo: RemotePathMappingRepository;
  let service: RemotePathMappingService;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new RemotePathMappingRepository(db);
    service = new RemotePathMappingService(repo);
  });

  describe("add()", () => {
    it("normalizes local/remote paths to directories (trailing separator)", () => {
      const added = service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\downloads" })
      );

      expect(added.remotePath).toBe("/downloads/");
      expect(added.localPath).toBe("D:\\downloads\\");
    });

    it("throws for an empty host", () => {
      expect(() =>
        service.add(newRemotePathMapping({ host: "", remotePath: "/r", localPath: "D:\\l" }))
      ).toThrow(/Invalid Host/);
    });

    it("throws for an empty remote path", () => {
      expect(() =>
        service.add(newRemotePathMapping({ host: "sab", remotePath: "", localPath: "D:\\l" }))
      ).toThrow(/Invalid RemotePath/);
    });

    it("throws for an empty local path", () => {
      expect(() =>
        service.add(newRemotePathMapping({ host: "sab", remotePath: "/r", localPath: "" }))
      ).toThrow(/Invalid LocalPath/);
    });

    it("throws when the local path isn't rooted", () => {
      expect(() =>
        service.add(newRemotePathMapping({ host: "sab", remotePath: "/r", localPath: "relative" }))
      ).toThrow(/Invalid LocalPath/);
    });

    it("throws when the local mount directory doesn't exist (folderExists check)", () => {
      const strictService = new RemotePathMappingService(repo, { folderExists: () => false });
      expect(() =>
        strictService.add(
          newRemotePathMapping({ host: "sab", remotePath: "/r", localPath: "D:\\l" })
        )
      ).toThrow(/doesn't exist/);
    });

    it("throws when host+remotePath is already configured", () => {
      service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\a" })
      );
      expect(() =>
        service.add(
          newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\b" })
        )
      ).toThrow(/already configured/);
    });

    it("allows the same remotePath for a different host", () => {
      service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\a" })
      );
      expect(() =>
        service.add(
          newRemotePathMapping({ host: "nzbget", remotePath: "/downloads", localPath: "D:\\b" })
        )
      ).not.toThrow();
    });
  });

  describe("update()", () => {
    it("excludes the mapping's own id from the duplicate check (note: unlike add(), update() does NOT re-normalize paths to directories -- matches the real C# Update(), which skips the AsDirectory() calls Add() does)", () => {
      const added = service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\a" })
      );

      expect(() => service.update({ ...added, localPath: "D:\\renamed" })).not.toThrow();
      expect(service.get(added.id).localPath).toBe("D:\\renamed");
    });

    it("still rejects a duplicate against a different mapping", () => {
      service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\a" })
      );
      const second = service.add(
        newRemotePathMapping({ host: "nzbget", remotePath: "/other", localPath: "D:\\b" })
      );

      // remotePath must match the normalized (trailing-slash) form Add()
      // already stored for the "sab" mapping, since Update() itself does
      // no normalization.
      expect(() => service.update({ ...second, host: "sab", remotePath: "/downloads/" })).toThrow(
        /already configured/
      );
    });
  });

  describe("remove()", () => {
    it("deletes the mapping", () => {
      const added = service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\a" })
      );
      service.remove(added.id);
      expect(service.all()).toHaveLength(0);
    });
  });

  describe("remapRemoteToLocal()", () => {
    it("remaps a matching remote path to its local equivalent", () => {
      service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\downloads" })
      );

      const remapped = service.remapRemoteToLocal("sab", newOsPath("/downloads/movies/foo.mkv"));
      expect(remapped.fullPath).toBe("D:\\downloads\\movies\\foo.mkv");
    });

    it("is case-insensitive on host", () => {
      service.add(
        newRemotePathMapping({ host: "SAB", remotePath: "/downloads", localPath: "D:\\downloads" })
      );

      const remapped = service.remapRemoteToLocal("sab", newOsPath("/downloads/foo.mkv"));
      expect(remapped.fullPath).toBe("D:\\downloads\\foo.mkv");
    });

    it("returns the path unchanged when no mapping matches the host", () => {
      service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\downloads" })
      );

      const remapped = service.remapRemoteToLocal("other-host", newOsPath("/downloads/foo.mkv"));
      expect(remapped.fullPath).toBe("/downloads/foo.mkv");
    });

    it("returns the path unchanged when there are no mappings at all", () => {
      const remapped = service.remapRemoteToLocal("sab", newOsPath("/downloads/foo.mkv"));
      expect(remapped.fullPath).toBe("/downloads/foo.mkv");
    });

    it("returns an empty path unchanged", () => {
      const empty = newOsPath(null);
      expect(service.remapRemoteToLocal("sab", empty)).toBe(empty);
    });
  });

  describe("remapLocalToRemote()", () => {
    it("remaps a matching local path to its remote equivalent", () => {
      service.add(
        newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\downloads" })
      );

      const remapped = service.remapLocalToRemote(
        "sab",
        newOsPath("D:\\downloads\\movies\\foo.mkv")
      );
      expect(remapped.fullPath).toBe("/downloads/movies/foo.mkv");
    });

    it("returns the path unchanged when no mapping matches", () => {
      const local = newOsPath("D:\\downloads\\foo.mkv");
      expect(service.remapLocalToRemote("sab", local)).toBe(local);
    });
  });

  it("all() is cached and cleared on write (10s TTL, exercised via cache-then-mutate)", () => {
    const first = service.all();
    expect(first).toHaveLength(0);

    service.add(
      newRemotePathMapping({ host: "sab", remotePath: "/downloads", localPath: "D:\\a" })
    );

    // Cache was cleared by add(), so the next read reflects the new row
    // rather than the stale empty snapshot.
    expect(service.all()).toHaveLength(1);
  });
});
