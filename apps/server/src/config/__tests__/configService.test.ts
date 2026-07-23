import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "../configService.js";
import { ConfigRepository } from "../configRepository.js";
import { InMemoryKeyValueRepository } from "../keyValueRepository.js";

function makeService() {
  const kv = new InMemoryKeyValueRepository();
  const repository = new ConfigRepository(kv);
  const onConfigSaved = vi.fn();
  const service = new ConfigService(repository, onConfigSaved);
  return { service, repository, kv, onConfigSaved };
}

describe("ConfigService defaults", () => {
  it("returns the C#-ported default for every boolean property when nothing is set", () => {
    const { service } = makeService();

    expect(service.autoUnmonitorPreviouslyDownloadedBooks).toBe(false);
    expect(service.enableCompletedDownloadHandling).toBe(true);
    expect(service.autoRedownloadFailed).toBe(true);
    expect(service.autoRedownloadFailedFromInteractiveSearch).toBe(true);
    expect(service.createEmptyAuthorFolders).toBe(false);
    expect(service.deleteEmptyFolders).toBe(false);
    expect(service.skipFreeSpaceCheckWhenImporting).toBe(false);
    expect(service.copyUsingHardlinks).toBe(true);
    expect(service.importExtraFiles).toBe(false);
    expect(service.watchLibraryForChanges).toBe(true);
    expect(service.setPermissionsLinux).toBe(false);
    expect(service.showRelativeDates).toBe(true);
    expect(service.enableColorImpairedMode).toBe(false);
    expect(service.cleanupMetadataImages).toBe(true);
    expect(service.scrubAudioTags).toBe(false);
    expect(service.updateCovers).toBe(true);
    expect(service.embedMetadata).toBe(false);
    expect(service.proxyEnabled).toBe(false);
    expect(service.proxyBypassLocalAddresses).toBe(true);
    expect(service.trustCgnatIpAddresses).toBe(false);
  });

  it("returns the C#-ported default for every numeric property when nothing is set", () => {
    const { service } = makeService();

    expect(service.retention).toBe(0);
    expect(service.recycleBinCleanupDays).toBe(7);
    expect(service.rssSyncInterval).toBe(15);
    expect(service.maximumSize).toBe(0);
    expect(service.minimumAge).toBe(0);
    expect(service.downloadClientHistoryLimit).toBe(60);
    expect(service.minimumFreeSpaceWhenImporting).toBe(100);
    expect(service.firstDayOfWeek).toBe(0);
    expect(service.uiLanguage).toBe(1);
    expect(service.proxyPort).toBe(8080);
    expect(service.backupInterval).toBe(7);
    expect(service.backupRetention).toBe(28);
  });

  it("returns the C#-ported default for every string property when nothing is set", () => {
    const { service } = makeService();

    expect(service.recycleBin).toBe("");
    expect(service.downloadClientWorkingFolders).toBe("_UNPACK_|_FAILED_");
    expect(service.extraFileExtensions).toBe("srt");
    expect(service.chmodFolder).toBe("755");
    expect(service.chownGroup).toBe("");
    expect(service.metadataSource).toBe("");
    expect(service.calendarWeekColumnHeader).toBe("ddd M/D");
    expect(service.shortDateFormat).toBe("MMM D YYYY");
    expect(service.longDateFormat).toBe("dddd, MMMM D YYYY");
    expect(service.timeFormat).toBe("h(:mm)a");
    expect(service.proxyHostname).toBe("");
    expect(service.proxyUsername).toBe("");
    expect(service.proxyPassword).toBe("");
    expect(service.proxyBypassFilter).toBe("");
    expect(service.backupFolder).toBe("Backups");
    expect(service.applicationUrl).toBe("");
  });

  it("returns the C#-ported default for every enum property when nothing is set", () => {
    const { service } = makeService();

    expect(service.downloadPropersAndRepacks).toBe("PreferAndUpgrade");
    expect(service.fileDate).toBe("None");
    expect(service.rescanAfterRefresh).toBe("Always");
    expect(service.allowFingerprinting).toBe("NewFiles");
    expect(service.writeAudioTags).toBe("No");
    expect(service.writeBookTags).toBe("NewFiles");
    expect(service.proxyType).toBe("Http");
    expect(service.certificateValidation).toBe("Enabled");
  });

  it("generates and persists a GUID-shaped value on first read of generate-on-read properties", () => {
    const { service, kv } = makeService();

    const plexId = service.plexClientIdentifier;
    expect(plexId).toMatch(/^[0-9a-f-]{36}$/i);
    // Persisted -- second read returns the exact same value.
    expect(service.plexClientIdentifier).toBe(plexId);
    expect(kv.get("plexclientidentifier")).toBe(plexId);

    const rijndaelPassphrase = service.rijndaelPassphrase;
    const hmacPassphrase = service.hmacPassphrase;
    const rijndaelSalt = service.rijndaelSalt;
    const hmacSalt = service.hmacSalt;
    expect(new Set([plexId, rijndaelPassphrase, hmacPassphrase, rijndaelSalt, hmacSalt]).size).toBe(
      5
    );
  });
});

describe("ConfigService persistence via KeyValueRepository", () => {
  it("persists a boolean setter and retrieves it back through a fresh ConfigService reading the same repository", () => {
    const { service, repository } = makeService();

    service.enableCompletedDownloadHandling = false;
    service.copyUsingHardlinks = false;

    const secondService = new ConfigService(repository);
    expect(secondService.enableCompletedDownloadHandling).toBe(false);
    expect(secondService.copyUsingHardlinks).toBe(false);
    // Untouched properties still report their defaults.
    expect(secondService.autoRedownloadFailed).toBe(true);
  });

  it("persists a numeric setter and retrieves it back", () => {
    const { service, repository } = makeService();

    service.retention = 500;
    service.rssSyncInterval = 30;

    const secondService = new ConfigService(repository);
    expect(secondService.retention).toBe(500);
    expect(secondService.rssSyncInterval).toBe(30);
  });

  it("persists a string setter and retrieves it back", () => {
    const { service, repository } = makeService();

    service.recycleBin = "/data/recycle";
    service.chmodFolder = "775";

    const secondService = new ConfigService(repository);
    expect(secondService.recycleBin).toBe("/data/recycle");
    expect(secondService.chmodFolder).toBe("775");
  });

  it("persists an enum setter (case-insensitively parsed back) and retrieves it back", () => {
    const { service, repository } = makeService();

    service.downloadPropersAndRepacks = "DoNotUpgrade";
    service.allowFingerprinting = "AllFiles";

    const secondService = new ConfigService(repository);
    expect(secondService.downloadPropersAndRepacks).toBe("DoNotUpgrade");
    expect(secondService.allowFingerprinting).toBe("AllFiles");
  });

  it("isDefined reflects whether a key has an explicit stored value", () => {
    const { service } = makeService();

    expect(service.isDefined("Retention")).toBe(false);
    service.retention = 10;
    expect(service.isDefined("Retention")).toBe(true);
    expect(service.isDefined("retention")).toBe(true);
  });

  it("saveConfigDictionary only writes values that changed from the current effective value, and fires the onConfigSaved callback once", () => {
    const { service, repository, onConfigSaved } = makeService();

    const setSpy = vi.spyOn(repository, "upsert");

    service.saveConfigDictionary({
      retention: 0, // matches default -- should NOT trigger a write
      rssSyncInterval: 45, // differs from default -- SHOULD trigger a write
    });

    // Ported faithfully from ConfigService.AllWithDefaults(), which reads
    // every property via reflection before comparing -- in the C# source
    // this has the same real side effect: the persist-on-read properties
    // (PlexClientIdentifier, RijndaelPassphrase, HmacPassphrase,
    // RijndaelSalt, HmacSalt) generate + persist a GUID the first time
    // anything calls AllWithDefaults(), not just the key being saved.
    // Isolate the assertion to the key this test actually cares about.
    const rssSyncCalls = setSpy.mock.calls.filter(([key]) => key === "rsssyncinterval");
    expect(rssSyncCalls).toHaveLength(1);
    expect(rssSyncCalls[0]).toEqual(["rsssyncinterval", "45"]);
    expect(setSpy.mock.calls.some(([key]) => key === "retention")).toBe(false);
    expect(onConfigSaved).toHaveBeenCalledTimes(1);

    const secondService = new ConfigService(repository);
    expect(secondService.rssSyncInterval).toBe(45);
    expect(secondService.retention).toBe(0);
  });

  it("caches repository reads for the life of the cache once it has been populated with at least one row", () => {
    const { service, repository } = makeService();

    // Seed one row so EnsureCache's `_cache.Any()` guard (ported as
    // `cache.size === 0`) actually holds after the first populate --
    // with a completely empty repository, EnsureCache re-fetches on
    // every read, matching the real C# source's identical behavior
    // (`_cache.Any()` stays false forever if `_repository.All()` keeps
    // returning zero rows).
    service.retention = 5;

    const allSpy = vi.spyOn(repository, "all");

    void service.retention;
    void service.rssSyncInterval;
    expect(allSpy).toHaveBeenCalledTimes(1);

    service.retention = 9;
    void service.rssSyncInterval;
    // Cache was cleared by the write, so a second `all()` call happens.
    expect(allSpy).toHaveBeenCalledTimes(2);
  });
});
