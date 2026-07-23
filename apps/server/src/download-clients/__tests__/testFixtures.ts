import { vi } from "vitest";
import type { IConfigService } from "../../config/configService.js";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import type { IIndexer } from "../../indexers/IIndexer.js";
import { createDownloadClientDefinition } from "../DownloadClientDefinition.js";
import type { DownloadClientLogger } from "../DownloadClientBase.js";
import { identityRemotePathMappingService } from "../RemotePathMappingService.js";
import type { RemoteBookLike } from "../RemoteBookLike.js";
import type { IDiskProviderLike } from "../IDiskProviderLike.js";

export const TEST_TITLE = "Droned.S01E01.Pilot.1080p.WEB-DL-DRONE";
export const TEST_DOWNLOAD_URL = "http://somewhere.com/Droned.S01E01.Pilot.1080p.WEB-DL-DRONE.ext";

export function noopLogger(): DownloadClientLogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/** Ported from DownloadClientFixtureBase.CreateRemoteBook(). */
export function createTestRemoteBook(overrides: Partial<RemoteBookLike> = {}): RemoteBookLike {
  return {
    release: {
      guid: "guid-1",
      title: TEST_TITLE,
      size: 1000,
      downloadUrl: TEST_DOWNLOAD_URL,
      indexerId: 1,
      indexer: "Test Indexer",
      author: null,
      book: null,
      indexerPriority: 25,
      downloadProtocol: DownloadProtocol.Torrent,
      publishDate: new Date().toISOString(),
      categories: [],
      languages: [],
      indexerFlags: 0,
      infoUrl: null,
      commentUrl: null,
    },
    seedConfiguration: null,
    releaseSource: 0,
    author: { id: 42 },
    books: [],
    ...overrides,
  };
}

export function fakeIndexer(): IIndexer {
  return {
    name: "Test Indexer",
    supportsRss: true,
    supportsSearch: true,
    protocol: DownloadProtocol.Torrent,
    definition: createIndexerDefinitionLike(),
    fetchRecent: vi.fn(),
    fetch: vi.fn(),
    getDownloadRequest: (link: string) => new HttpRequest(link),
    test: vi.fn(),
    requestAction: vi.fn(),
  };
}

function createIndexerDefinitionLike() {
  return {
    id: 1,
    name: "Test Indexer",
    implementation: "Torznab",
    configContract: null,
    settings: null,
    tags: [],
    enableRss: true,
    enableAutomaticSearch: true,
    enableInteractiveSearch: true,
    downloadClientId: 0,
    protocol: DownloadProtocol.Torrent,
    supportsRss: true,
    supportsSearch: true,
    priority: 25,
  };
}

export function fakeConfigService(overrides: Partial<IConfigService> = {}): IConfigService {
  return {
    saveConfigDictionary: vi.fn(),
    isDefined: vi.fn(() => false),
    downloadClientWorkingFolders: "_UNPACK_|_FAILED_",
    downloadClientHistoryLimit: 30,
    enableCompletedDownloadHandling: true,
    autoRedownloadFailed: true,
    autoRedownloadFailedFromInteractiveSearch: true,
    autoUnmonitorPreviouslyDownloadedBooks: false,
    recycleBin: "",
    recycleBinCleanupDays: 7,
    downloadPropersAndRepacks: "PreferAndUpgrade",
    createEmptyAuthorFolders: false,
    deleteEmptyFolders: false,
    fileDate: "None",
    skipFreeSpaceCheckWhenImporting: false,
    minimumFreeSpaceWhenImporting: 100,
    copyUsingHardlinks: true,
    importExtraFiles: false,
    extraFileExtensions: "srt",
    watchLibraryForChanges: true,
    rescanAfterRefresh: "Always",
    allowFingerprinting: "NewFiles",
    setPermissionsLinux: false,
    chmodFolder: "755",
    chownGroup: "",
    retention: 0,
    rssSyncInterval: 15,
    maximumSize: 0,
    minimumAge: 0,
    firstDayOfWeek: 0,
    calendarWeekColumnHeader: "ddd M/D",
    shortDateFormat: "MMM D YYYY",
    longDateFormat: "dddd, MMMM D YYYY",
    timeFormat: "h(:mm)a",
    showRelativeDates: true,
    enableColorImpairedMode: false,
    uiLanguage: 1,
    cleanupMetadataImages: true,
    plexClientIdentifier: "test-guid",
    metadataSource: "",
    writeAudioTags: "No",
    scrubAudioTags: false,
    writeBookTags: "NewFiles",
    updateCovers: true,
    embedMetadata: false,
    rijndaelPassphrase: "x",
    hmacPassphrase: "x",
    rijndaelSalt: "x",
    hmacSalt: "x",
    proxyEnabled: false,
    proxyType: "Http",
    proxyHostname: "",
    proxyPort: 8080,
    proxyUsername: "",
    proxyPassword: "",
    proxyBypassFilter: "",
    proxyBypassLocalAddresses: true,
    backupFolder: "Backups",
    backupInterval: 7,
    backupRetention: 28,
    certificateValidation: "Enabled",
    applicationUrl: "",
    trustCgnatIpAddresses: false,
    ...overrides,
  };
}

export function fakeDiskProvider(overrides: Partial<IDiskProviderLike> = {}): IDiskProviderLike {
  return {
    folderExists: vi.fn(() => true),
    fileExists: vi.fn(() => false),
    folderWritable: vi.fn(() => true),
    deleteFolder: vi.fn(),
    deleteFile: vi.fn(),
    openWriteStream: vi.fn(),
    getDirectories: vi.fn(() => []),
    getFiles: vi.fn(() => []),
    getFileSize: vi.fn(() => 0),
    isFileLocked: vi.fn(() => false),
    folderGetCreationTime: vi.fn(() => Date.now()),
    folderGetLastWrite: vi.fn(() => Date.now()),
    fileGetLastWrite: vi.fn(() => Date.now()),
    ...overrides,
  };
}

export function fakeHttpClient(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    execute: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    head: vi.fn(),
    post: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), new Uint8Array(), 200)),
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
    ...overrides,
  };
}

export const identityRemotePathMapping = identityRemotePathMappingService;

export { createDownloadClientDefinition };
