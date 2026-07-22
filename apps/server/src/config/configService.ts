/**
 * Ported from NzbDrone.Core/Configuration/IConfigService.cs and
 * ConfigService.cs.
 *
 * This is Readarr's typed wrapper over the raw DB-backed key-value store
 * (IConfigRepository): every property here is a strongly-typed
 * getter/setter over a string key in the Config table, with a default
 * value used whenever the key is not present yet. Application code
 * throughout Readarr calls this service to read settings; faithfulness to
 * property names and default values matters, since later-ported modules
 * will depend on this shape.
 *
 * Deviations from the C# source (all mechanical, not behavioral):
 *  - No DI container / IEventAggregator: ConfigSavedEvent publication
 *    in SaveConfigDictionary is replaced with a plain optional callback
 *    (onConfigSaved) passed in at construction. The Messaging module
 *    (Phase 4) owns porting the real event bus; this is a stand-in so the
 *    "notify something changed" behavior is not silently dropped.
 *  - No NLog Logger: trace-level logging calls from the C# source
 *    are omitted rather than routed anywhere, since Instrumentation
 *    (Phase 4) has not been ported yet. Nothing here needs logging to
 *    behave correctly.
 *  - Convert.ToBoolean / Convert.ToInt32 C# semantics are approximated
 *    with straightforward JS parsing (see toBool/toInt below).
 */

import type { ConfigRepository } from "./configRepository.js";
import {
  ALLOW_FINGERPRINTING_VALUES,
  CERTIFICATE_VALIDATION_TYPE_VALUES,
  FILE_DATE_TYPE_VALUES,
  PROPER_DOWNLOAD_TYPES_VALUES,
  PROXY_TYPE_VALUES,
  RESCAN_AFTER_REFRESH_TYPE_VALUES,
  WRITE_AUDIO_TAGS_TYPE_VALUES,
  WRITE_BOOK_TAGS_TYPE_VALUES,
  type AllowFingerprinting,
  type CertificateValidationType,
  type FileDateType,
  type ProperDownloadTypes,
  type ProxyType,
  type RescanAfterRefreshType,
  type WriteAudioTagsType,
  type WriteBookTagsType,
} from "./enums.js";

export interface IConfigService {
  saveConfigDictionary(configValues: Record<string, unknown>): void;
  isDefined(key: string): boolean;

  downloadClientWorkingFolders: string;
  downloadClientHistoryLimit: number;

  enableCompletedDownloadHandling: boolean;
  autoRedownloadFailed: boolean;
  autoRedownloadFailedFromInteractiveSearch: boolean;

  autoUnmonitorPreviouslyDownloadedBooks: boolean;
  recycleBin: string;
  recycleBinCleanupDays: number;
  downloadPropersAndRepacks: ProperDownloadTypes;
  createEmptyAuthorFolders: boolean;
  deleteEmptyFolders: boolean;
  fileDate: FileDateType;
  skipFreeSpaceCheckWhenImporting: boolean;
  minimumFreeSpaceWhenImporting: number;
  copyUsingHardlinks: boolean;
  importExtraFiles: boolean;
  extraFileExtensions: string;
  watchLibraryForChanges: boolean;
  rescanAfterRefresh: RescanAfterRefreshType;
  allowFingerprinting: AllowFingerprinting;

  setPermissionsLinux: boolean;
  chmodFolder: string;
  chownGroup: string;

  retention: number;
  rssSyncInterval: number;
  maximumSize: number;
  minimumAge: number;

  firstDayOfWeek: number;
  calendarWeekColumnHeader: string;
  shortDateFormat: string;
  longDateFormat: string;
  timeFormat: string;
  showRelativeDates: boolean;
  enableColorImpairedMode: boolean;
  uiLanguage: number;

  cleanupMetadataImages: boolean;

  readonly plexClientIdentifier: string;

  metadataSource: string;
  writeAudioTags: WriteAudioTagsType;
  scrubAudioTags: boolean;
  writeBookTags: WriteBookTagsType;
  updateCovers: boolean;
  embedMetadata: boolean;

  readonly rijndaelPassphrase: string;
  readonly hmacPassphrase: string;
  readonly rijndaelSalt: string;
  readonly hmacSalt: string;

  readonly proxyEnabled: boolean;
  readonly proxyType: ProxyType;
  readonly proxyHostname: string;
  readonly proxyPort: number;
  readonly proxyUsername: string;
  readonly proxyPassword: string;
  readonly proxyBypassFilter: string;
  readonly proxyBypassLocalAddresses: boolean;

  readonly backupFolder: string;
  readonly backupInterval: number;
  readonly backupRetention: number;

  readonly certificateValidation: CertificateValidationType;
  readonly applicationUrl: string;

  trustCgnatIpAddresses: boolean;
}

function toBool(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseEnum<T extends string>(allowed: readonly T[], value: string, key: string): T {
  const normalized = value.trim().toLowerCase();
  const match = allowed.find((candidate) => candidate.toLowerCase() === normalized);
  if (match === undefined) {
    const allowedList = allowed.join(", ");
    throw new Error("Invalid value '" + value + "' for enum key '" + key + "'. Expected one of: " + allowedList);
  }
  return match;
}

function newGuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class ConfigService implements IConfigService {
  private cache = new Map<string, string>();

  constructor(
    private readonly repository: ConfigRepository,
    private readonly onConfigSaved?: () => void,
  ) {}

  private allWithDefaults(): Record<string, unknown> {
    return {
      autoUnmonitorPreviouslyDownloadedBooks: this.autoUnmonitorPreviouslyDownloadedBooks,
      retention: this.retention,
      recycleBin: this.recycleBin,
      recycleBinCleanupDays: this.recycleBinCleanupDays,
      rssSyncInterval: this.rssSyncInterval,
      maximumSize: this.maximumSize,
      minimumAge: this.minimumAge,
      downloadPropersAndRepacks: this.downloadPropersAndRepacks,
      enableCompletedDownloadHandling: this.enableCompletedDownloadHandling,
      autoRedownloadFailed: this.autoRedownloadFailed,
      autoRedownloadFailedFromInteractiveSearch: this.autoRedownloadFailedFromInteractiveSearch,
      createEmptyAuthorFolders: this.createEmptyAuthorFolders,
      deleteEmptyFolders: this.deleteEmptyFolders,
      fileDate: this.fileDate,
      downloadClientWorkingFolders: this.downloadClientWorkingFolders,
      downloadClientHistoryLimit: this.downloadClientHistoryLimit,
      skipFreeSpaceCheckWhenImporting: this.skipFreeSpaceCheckWhenImporting,
      minimumFreeSpaceWhenImporting: this.minimumFreeSpaceWhenImporting,
      copyUsingHardlinks: this.copyUsingHardlinks,
      importExtraFiles: this.importExtraFiles,
      extraFileExtensions: this.extraFileExtensions,
      watchLibraryForChanges: this.watchLibraryForChanges,
      rescanAfterRefresh: this.rescanAfterRefresh,
      allowFingerprinting: this.allowFingerprinting,
      setPermissionsLinux: this.setPermissionsLinux,
      chmodFolder: this.chmodFolder,
      chownGroup: this.chownGroup,
      metadataSource: this.metadataSource,
      writeAudioTags: this.writeAudioTags,
      scrubAudioTags: this.scrubAudioTags,
      writeBookTags: this.writeBookTags,
      updateCovers: this.updateCovers,
      embedMetadata: this.embedMetadata,
      firstDayOfWeek: this.firstDayOfWeek,
      calendarWeekColumnHeader: this.calendarWeekColumnHeader,
      shortDateFormat: this.shortDateFormat,
      longDateFormat: this.longDateFormat,
      timeFormat: this.timeFormat,
      showRelativeDates: this.showRelativeDates,
      enableColorImpairedMode: this.enableColorImpairedMode,
      uiLanguage: this.uiLanguage,
      cleanupMetadataImages: this.cleanupMetadataImages,
      plexClientIdentifier: this.plexClientIdentifier,
      rijndaelPassphrase: this.rijndaelPassphrase,
      hmacPassphrase: this.hmacPassphrase,
      rijndaelSalt: this.rijndaelSalt,
      hmacSalt: this.hmacSalt,
      proxyEnabled: this.proxyEnabled,
      proxyType: this.proxyType,
      proxyHostname: this.proxyHostname,
      proxyPort: this.proxyPort,
      proxyUsername: this.proxyUsername,
      proxyPassword: this.proxyPassword,
      proxyBypassFilter: this.proxyBypassFilter,
      proxyBypassLocalAddresses: this.proxyBypassLocalAddresses,
      backupFolder: this.backupFolder,
      backupInterval: this.backupInterval,
      backupRetention: this.backupRetention,
      certificateValidation: this.certificateValidation,
      applicationUrl: this.applicationUrl,
      trustCgnatIpAddresses: this.trustCgnatIpAddresses,
    };
  }

  saveConfigDictionary(configValues: Record<string, unknown>): void {
    const allWithDefaults = this.allWithDefaults();

    for (const [key, value] of Object.entries(configValues)) {
      const currentValue = allWithDefaults[key];
      if (currentValue === undefined || currentValue === null || value === undefined || value === null) {
        continue;
      }

      const equal = String(value) === String(currentValue);
      if (!equal) {
        this.setValue(key, String(value));
      }
    }

    this.onConfigSaved?.();
  }

  isDefined(key: string): boolean {
    return this.repository.get(key.toLowerCase()) !== undefined;
  }

  private getValue(key: string, defaultValue: unknown, persist = false): string {
    const lowerKey = key.toLowerCase();
    if (!lowerKey.trim()) {
      throw new Error("key must not be null or whitespace");
    }

    this.ensureCache();

    const dbValue = this.cache.get(lowerKey);
    if (dbValue !== undefined && dbValue !== "") {
      return dbValue;
    }

    if (persist) {
      this.setValue(lowerKey, String(defaultValue));
    }

    return String(defaultValue);
  }

  private getValueBoolean(key: string, defaultValue = false): boolean {
    return toBool(this.getValue(key, defaultValue));
  }

  private getValueInt(key: string, defaultValue = 0): number {
    return toInt(this.getValue(key, defaultValue));
  }

  private getValueEnum<T extends string>(allowed: readonly T[], key: string, defaultValue: T): T {
    return parseEnum(allowed, this.getValue(key, defaultValue), key);
  }

  private setValue(key: string, value: string | number | boolean): void {
    const lowerKey = key.toLowerCase();
    const stringValue = typeof value === "boolean" || typeof value === "number" ? String(value) : value;

    this.repository.upsert(lowerKey, stringValue);
    this.clearCache();
  }

  private ensureCache(): void {
    if (this.cache.size === 0) {
      const all = this.repository.all();
      this.cache = new Map(all.map((c) => [c.key.toLowerCase(), c.value]));
    }
  }

  private clearCache(): void {
    this.cache = new Map();
  }

  get enableCompletedDownloadHandling(): boolean {
    return this.getValueBoolean("EnableCompletedDownloadHandling", true);
  }
  set enableCompletedDownloadHandling(value: boolean) {
    this.setValue("EnableCompletedDownloadHandling", value);
  }

  get autoRedownloadFailed(): boolean {
    return this.getValueBoolean("AutoRedownloadFailed", true);
  }
  set autoRedownloadFailed(value: boolean) {
    this.setValue("AutoRedownloadFailed", value);
  }

  get autoRedownloadFailedFromInteractiveSearch(): boolean {
    return this.getValueBoolean("AutoRedownloadFailedFromInteractiveSearch", true);
  }
  set autoRedownloadFailedFromInteractiveSearch(value: boolean) {
    this.setValue("AutoRedownloadFailedFromInteractiveSearch", value);
  }

  get downloadClientWorkingFolders(): string {
    return this.getValue("DownloadClientWorkingFolders", "_UNPACK_|_FAILED_");
  }
  set downloadClientWorkingFolders(value: string) {
    this.setValue("DownloadClientWorkingFolders", value);
  }

  get downloadClientHistoryLimit(): number {
    return this.getValueInt("DownloadClientHistoryLimit", 60);
  }
  set downloadClientHistoryLimit(value: number) {
    this.setValue("DownloadClientHistoryLimit", value);
  }

  get autoUnmonitorPreviouslyDownloadedBooks(): boolean {
    return this.getValueBoolean("AutoUnmonitorPreviouslyDownloadedBooks");
  }
  set autoUnmonitorPreviouslyDownloadedBooks(value: boolean) {
    this.setValue("AutoUnmonitorPreviouslyDownloadedBooks", value);
  }

  get recycleBin(): string {
    return this.getValue("RecycleBin", "");
  }
  set recycleBin(value: string) {
    this.setValue("RecycleBin", value);
  }

  get recycleBinCleanupDays(): number {
    return this.getValueInt("RecycleBinCleanupDays", 7);
  }
  set recycleBinCleanupDays(value: number) {
    this.setValue("RecycleBinCleanupDays", value);
  }

  get downloadPropersAndRepacks(): ProperDownloadTypes {
    return this.getValueEnum(PROPER_DOWNLOAD_TYPES_VALUES, "DownloadPropersAndRepacks", "PreferAndUpgrade");
  }
  set downloadPropersAndRepacks(value: ProperDownloadTypes) {
    this.setValue("DownloadPropersAndRepacks", value.toLowerCase());
  }

  get createEmptyAuthorFolders(): boolean {
    return this.getValueBoolean("CreateEmptyAuthorFolders", false);
  }
  set createEmptyAuthorFolders(value: boolean) {
    this.setValue("CreateEmptyAuthorFolders", value);
  }

  get deleteEmptyFolders(): boolean {
    return this.getValueBoolean("DeleteEmptyFolders", false);
  }
  set deleteEmptyFolders(value: boolean) {
    this.setValue("DeleteEmptyFolders", value);
  }

  get fileDate(): FileDateType {
    return this.getValueEnum(FILE_DATE_TYPE_VALUES, "FileDate", "None");
  }
  set fileDate(value: FileDateType) {
    this.setValue("FileDate", value.toLowerCase());
  }

  get skipFreeSpaceCheckWhenImporting(): boolean {
    return this.getValueBoolean("SkipFreeSpaceCheckWhenImporting", false);
  }
  set skipFreeSpaceCheckWhenImporting(value: boolean) {
    this.setValue("SkipFreeSpaceCheckWhenImporting", value);
  }

  get minimumFreeSpaceWhenImporting(): number {
    return this.getValueInt("MinimumFreeSpaceWhenImporting", 100);
  }
  set minimumFreeSpaceWhenImporting(value: number) {
    this.setValue("MinimumFreeSpaceWhenImporting", value);
  }

  get copyUsingHardlinks(): boolean {
    return this.getValueBoolean("CopyUsingHardlinks", true);
  }
  set copyUsingHardlinks(value: boolean) {
    this.setValue("CopyUsingHardlinks", value);
  }

  get importExtraFiles(): boolean {
    return this.getValueBoolean("ImportExtraFiles", false);
  }
  set importExtraFiles(value: boolean) {
    this.setValue("ImportExtraFiles", value);
  }

  get extraFileExtensions(): string {
    return this.getValue("ExtraFileExtensions", "srt");
  }
  set extraFileExtensions(value: string) {
    this.setValue("ExtraFileExtensions", value);
  }

  get watchLibraryForChanges(): boolean {
    return this.getValueBoolean("WatchLibraryForChanges", true);
  }
  set watchLibraryForChanges(value: boolean) {
    this.setValue("WatchLibraryForChanges", value);
  }

  get rescanAfterRefresh(): RescanAfterRefreshType {
    return this.getValueEnum(RESCAN_AFTER_REFRESH_TYPE_VALUES, "RescanAfterRefresh", "Always");
  }
  set rescanAfterRefresh(value: RescanAfterRefreshType) {
    this.setValue("RescanAfterRefresh", value.toLowerCase());
  }

  get allowFingerprinting(): AllowFingerprinting {
    return this.getValueEnum(ALLOW_FINGERPRINTING_VALUES, "AllowFingerprinting", "NewFiles");
  }
  set allowFingerprinting(value: AllowFingerprinting) {
    this.setValue("AllowFingerprinting", value.toLowerCase());
  }

  get setPermissionsLinux(): boolean {
    return this.getValueBoolean("SetPermissionsLinux", false);
  }
  set setPermissionsLinux(value: boolean) {
    this.setValue("SetPermissionsLinux", value);
  }

  get chmodFolder(): string {
    return this.getValue("ChmodFolder", "755");
  }
  set chmodFolder(value: string) {
    this.setValue("ChmodFolder", value);
  }

  get chownGroup(): string {
    return this.getValue("ChownGroup", "");
  }
  set chownGroup(value: string) {
    this.setValue("ChownGroup", value);
  }

  get retention(): number {
    return this.getValueInt("Retention", 0);
  }
  set retention(value: number) {
    this.setValue("Retention", value);
  }

  get rssSyncInterval(): number {
    return this.getValueInt("RssSyncInterval", 15);
  }
  set rssSyncInterval(value: number) {
    this.setValue("RssSyncInterval", value);
  }

  get maximumSize(): number {
    return this.getValueInt("MaximumSize", 0);
  }
  set maximumSize(value: number) {
    this.setValue("MaximumSize", value);
  }

  get minimumAge(): number {
    return this.getValueInt("MinimumAge", 0);
  }
  set minimumAge(value: number) {
    this.setValue("MinimumAge", value);
  }

  /**
   * C# default: (int)CultureInfo.CurrentCulture.DateTimeFormat.FirstDayOfWeek.
   * There is no direct Node equivalent of .NET's current-culture calendar
   * info without a locale-data dependency; this ports the practical
   * default most deployments would see (Sunday = 0, matching .NET's
   * DayOfWeek enum ordering and the invariant/en-US culture default).
   */
  get firstDayOfWeek(): number {
    return this.getValueInt("FirstDayOfWeek", 0);
  }
  set firstDayOfWeek(value: number) {
    this.setValue("FirstDayOfWeek", value);
  }

  get calendarWeekColumnHeader(): string {
    return this.getValue("CalendarWeekColumnHeader", "ddd M/D");
  }
  set calendarWeekColumnHeader(value: string) {
    this.setValue("CalendarWeekColumnHeader", value);
  }

  get shortDateFormat(): string {
    return this.getValue("ShortDateFormat", "MMM D YYYY");
  }
  set shortDateFormat(value: string) {
    this.setValue("ShortDateFormat", value);
  }

  get longDateFormat(): string {
    return this.getValue("LongDateFormat", "dddd, MMMM D YYYY");
  }
  set longDateFormat(value: string) {
    this.setValue("LongDateFormat", value);
  }

  get timeFormat(): string {
    return this.getValue("TimeFormat", "h(:mm)a");
  }
  set timeFormat(value: string) {
    this.setValue("TimeFormat", value);
  }

  get showRelativeDates(): boolean {
    return this.getValueBoolean("ShowRelativeDates", true);
  }
  set showRelativeDates(value: boolean) {
    this.setValue("ShowRelativeDates", value);
  }

  get enableColorImpairedMode(): boolean {
    return this.getValueBoolean("EnableColorImpairedMode", false);
  }
  set enableColorImpairedMode(value: boolean) {
    this.setValue("EnableColorImpairedMode", value);
  }

  /**
   * C# default: (int)Language.English. Ported as the literal default 1
   * (English's id in Readarr's Languages module, Phase 1 -- not yet
   * ported here, so this is a plain int default, not an enum reference).
   */
  get uiLanguage(): number {
    return this.getValueInt("UILanguage", 1);
  }
  set uiLanguage(value: number) {
    this.setValue("UILanguage", value);
  }

  get cleanupMetadataImages(): boolean {
    return this.getValueBoolean("CleanupMetadataImages", true);
  }
  set cleanupMetadataImages(value: boolean) {
    this.setValue("CleanupMetadataImages", value);
  }

  /**
   * C#: PlexClientIdentifier => GetValue("PlexClientIdentifier",
   * Guid.NewGuid().ToString(), true) -- generated once, persisted on
   * first read.
   */
  get plexClientIdentifier(): string {
    return this.getValue("PlexClientIdentifier", newGuid(), true);
  }

  get metadataSource(): string {
    return this.getValue("MetadataSource", "");
  }
  set metadataSource(value: string) {
    this.setValue("MetadataSource", value);
  }

  get writeAudioTags(): WriteAudioTagsType {
    return this.getValueEnum(WRITE_AUDIO_TAGS_TYPE_VALUES, "WriteAudioTags", "No");
  }
  set writeAudioTags(value: WriteAudioTagsType) {
    this.setValue("WriteAudioTags", value.toLowerCase());
  }

  get scrubAudioTags(): boolean {
    return this.getValueBoolean("ScrubAudioTags", false);
  }
  set scrubAudioTags(value: boolean) {
    this.setValue("ScrubAudioTags", value);
  }

  get writeBookTags(): WriteBookTagsType {
    return this.getValueEnum(WRITE_BOOK_TAGS_TYPE_VALUES, "WriteBookTags", "NewFiles");
  }
  set writeBookTags(value: WriteBookTagsType) {
    this.setValue("WriteBookTags", value.toLowerCase());
  }

  get updateCovers(): boolean {
    return this.getValueBoolean("UpdateCovers", true);
  }
  set updateCovers(value: boolean) {
    this.setValue("UpdateCovers", value);
  }

  get embedMetadata(): boolean {
    return this.getValueBoolean("EmbedMetadata", false);
  }
  set embedMetadata(value: boolean) {
    this.setValue("EmbedMetadata", value);
  }

  get rijndaelPassphrase(): string {
    return this.getValue("RijndaelPassphrase", newGuid(), true);
  }

  get hmacPassphrase(): string {
    return this.getValue("HmacPassphrase", newGuid(), true);
  }

  get rijndaelSalt(): string {
    return this.getValue("RijndaelSalt", newGuid(), true);
  }

  get hmacSalt(): string {
    return this.getValue("HmacSalt", newGuid(), true);
  }

  get proxyEnabled(): boolean {
    return this.getValueBoolean("ProxyEnabled", false);
  }

  get proxyType(): ProxyType {
    return this.getValueEnum(PROXY_TYPE_VALUES, "ProxyType", "Http");
  }

  get proxyHostname(): string {
    return this.getValue("ProxyHostname", "");
  }

  get proxyPort(): number {
    return this.getValueInt("ProxyPort", 8080);
  }

  get proxyUsername(): string {
    return this.getValue("ProxyUsername", "");
  }

  get proxyPassword(): string {
    return this.getValue("ProxyPassword", "");
  }

  get proxyBypassFilter(): string {
    return this.getValue("ProxyBypassFilter", "");
  }

  get proxyBypassLocalAddresses(): boolean {
    return this.getValueBoolean("ProxyBypassLocalAddresses", true);
  }

  get backupFolder(): string {
    return this.getValue("BackupFolder", "Backups");
  }

  get backupInterval(): number {
    return this.getValueInt("BackupInterval", 7);
  }

  get backupRetention(): number {
    return this.getValueInt("BackupRetention", 28);
  }

  get certificateValidation(): CertificateValidationType {
    return this.getValueEnum(CERTIFICATE_VALIDATION_TYPE_VALUES, "CertificateValidation", "Enabled");
  }

  get applicationUrl(): string {
    return this.getValue("ApplicationUrl", "");
  }

  get trustCgnatIpAddresses(): boolean {
    return this.getValueBoolean("TrustCgnatIpAddresses", false);
  }
  set trustCgnatIpAddresses(value: boolean) {
    this.setValue("TrustCgnatIpAddresses", value);
  }
}
