/**
 * Ported from NzbDrone.Core/Configuration/ConfigFileProvider.cs.
 *
 * Readarr's bootstrap config lives on disk (config.xml) separately from the
 * DB-backed Config table (ConfigService/ConfigRepository), because it holds
 * settings needed before the DB is even open: port, API key, URL base, SSL
 * settings, log level, etc. IConfigFileProvider also doubles as an
 * ApplicationStartedEvent handler (ensures the file exists + migrates old
 * values) and an IExecute<ResetApiKeyCommand> handler.
 *
 * Deviations from the C# source:
 *  - Format: JSON, not XML. There is no compatibility requirement to
 *    keep XML (no existing Readarr installs to migrate config.xml from),
 *    and JSON is the idiomatic choice for a Node app -- no XML parser
 *    dependency needed, and it round-trips native JS types (numbers,
 *    booleans) without the C# source's ToString()/Convert.To* string
 *    coercion dance. This is an explicit, intentional deviation.
 *  - No Microsoft.Extensions.Options env/CLI-arg overlays. The C#
 *    class layers IOptions<PostgresOptions>, AuthOptions, AppOptions,
 *    ServerOptions, UpdateOptions, LogOptions on top of the file
 *    value (env vars / CLI args win over the file). Postgres support is not
 *    part of this module's scope (PORT_PLAN.md's Datastore module owns
 *    node:sqlite, no Postgres backend planned), so Postgres fields are
 *    dropped entirely. The remaining options-overlay fields (bind address,
 *    port, SSL, auth enabled/method, etc.) are collapsed into a single
 *    optional envOverrides argument on the constructor, since there is no
 *    ported DI/options-binding infrastructure yet to source them from real
 *    environment variables -- this keeps the override mechanism (file
 *    value can be overridden by an external source) faithful without
 *    inventing env-var parsing that nothing upstream provides yet.
 *  - No ICacheManager/ICached<string>: replaced with a plain
 *    in-memory Map, which is what ICached<string> amounts to for this
 *    use case (get-or-compute with an explicit Set/Clear).
 *  - No IEventAggregator: ConfigFileSavedEvent publication is a
 *    plain optional callback, same deviation as ConfigService.
 *  - DeploymentInfoProvider.cs is read-only startup info (package/
 *    release version, update mechanism, branch) sourced from
 *    package_info/release_info files dropped next to the compiled
 *    binary by Readarr's build/release pipeline. Node/npm has no
 *    equivalent artifact-side-channel convention, and nothing in Phase 0
 *    depends on it, so it is NOT ported here -- noted as deferred, not
 *    forgotten. If a later module needs branch/update-mechanism info for
 *    self-update UI, port it then against package.json version fields.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  AUTHENTICATION_REQUIRED_TYPE_VALUES,
  AUTHENTICATION_TYPE_VALUES,
  UPDATE_MECHANISM_VALUES,
  type AuthenticationRequiredType,
  type AuthenticationType,
  type UpdateMechanism,
} from "./enums.js";
import { InvalidConfigFileError, AccessDeniedConfigFileError } from "./errors.js";

/** The full set of bootstrap config fields, mirroring IConfigFileProvider's properties. */
export interface ConfigFileValues {
  bindAddress: string;
  port: number;
  sslPort: number;
  enableSsl: boolean;
  launchBrowser: boolean;
  authenticationMethod: AuthenticationType;
  authenticationRequired: AuthenticationRequiredType;
  analyticsEnabled: boolean;
  logLevel: string;
  consoleLogLevel: string;
  logSql: boolean;
  logRotate: number;
  filterSentryEvents: boolean;
  branch: string;
  apiKey: string;
  sslCertPath: string;
  sslCertPassword: string;
  urlBase: string;
  instanceName: string;
  updateAutomatically: boolean;
  updateMechanism: UpdateMechanism;
  updateScriptPath: string;
  syslogServer: string;
  syslogPort: number;
  syslogLevel: string;
  theme: string;
  trustCgnatIpAddresses: boolean;
}

/** Optional external overrides -- stand-in for the C# IOptions<T> env/CLI-arg overlay layer. See file header. */
export type ConfigFileEnvOverrides = Partial<{
  bindAddress: string;
  port: number;
  sslPort: number;
  enableSsl: boolean;
  launchBrowser: boolean;
  apiKey: string;
  authenticationEnabled: boolean;
  authenticationMethod: string;
  authenticationRequired: string;
  analyticsEnabled: boolean;
  branch: string;
  logLevel: string;
  consoleLogLevel: string;
  logSql: boolean;
  logRotate: number;
  filterSentryEvents: boolean;
  sslCertPath: string;
  sslCertPassword: string;
  urlBase: string;
  instanceName: string;
  updateAutomatically: boolean;
  updateMechanism: string;
  updateScriptPath: string;
  syslogServer: string;
  syslogPort: number;
  syslogLevel: string;
  theme: string;
  trustCgnatIpAddresses: boolean;
}>;

const DEFAULT_APP_NAME = "Pagarr";

/** Ported default values from ConfigFileProvider.cs's property getters (the defaultValue argument of each GetValue call). */
const DEFAULTS: ConfigFileValues = {
  bindAddress: "*",
  port: 8787,
  sslPort: 6868,
  enableSsl: false,
  launchBrowser: true,
  authenticationMethod: "None",
  authenticationRequired: "Enabled",
  analyticsEnabled: true,
  logLevel: "debug",
  consoleLogLevel: "",
  logSql: false,
  logRotate: 50,
  filterSentryEvents: true,
  branch: "develop",
  apiKey: "",
  sslCertPath: "",
  sslCertPassword: "",
  urlBase: "",
  instanceName: DEFAULT_APP_NAME,
  updateAutomatically: false,
  updateMechanism: "BuiltIn",
  updateScriptPath: "",
  syslogServer: "",
  syslogPort: 514,
  syslogLevel: "",
  theme: "auto",
  trustCgnatIpAddresses: false,
};

function generateApiKey(): string {
  return randomUUID().replace(/-/g, "");
}

export class ConfigFileProvider {
  private cache = new Map<string, unknown>();

  constructor(
    private readonly configFilePath: string,
    private readonly envOverrides: ConfigFileEnvOverrides = {},
    private readonly onConfigFileSaved?: () => void,
  ) {}

  /** Ported from ConfigFileProvider.GetConfigDictionary(). */
  getConfigDictionary(): Record<string, unknown> {
    return {
      bindAddress: this.bindAddress,
      port: this.port,
      sslPort: this.sslPort,
      enableSsl: this.enableSsl,
      launchBrowser: this.launchBrowser,
      authenticationMethod: this.authenticationMethod,
      authenticationRequired: this.authenticationRequired,
      analyticsEnabled: this.analyticsEnabled,
      logLevel: this.logLevel,
      consoleLogLevel: this.consoleLogLevel,
      logSql: this.logSql,
      logRotate: this.logRotate,
      filterSentryEvents: this.filterSentryEvents,
      branch: this.branch,
      apiKey: this.apiKey,
      sslCertPath: this.sslCertPath,
      sslCertPassword: this.sslCertPassword,
      urlBase: this.urlBase,
      instanceName: this.instanceName,
      updateAutomatically: this.updateAutomatically,
      updateMechanism: this.updateMechanism,
      updateScriptPath: this.updateScriptPath,
      syslogServer: this.syslogServer,
      syslogPort: this.syslogPort,
      syslogLevel: this.syslogLevel,
      theme: this.theme,
      trustCgnatIpAddresses: this.trustCgnatIpAddresses,
    };
  }

  /** Ported from ConfigFileProvider.SaveConfigDictionary(Dictionary<string, object>). */
  saveConfigDictionary(configValues: Record<string, unknown>): void {
    this.cache.clear();

    const allWithDefaults = this.getConfigDictionary();

    for (const [key, value] of Object.entries(configValues)) {
      if (key.toLowerCase() === "apikey") {
        continue;
      }

      const currentValue = allWithDefaults[key];
      if (currentValue === undefined) {
        continue;
      }

      const equal = String(value) === String(currentValue);
      if (!equal) {
        this.setValue(key, value as string | number | boolean);
      }
    }

    this.onConfigFileSaved?.();
  }

  get bindAddress(): string {
    const value = this.envOverrides.bindAddress ?? this.getValue("bindAddress", DEFAULTS.bindAddress);
    if (!value || !value.trim()) {
      return DEFAULTS.bindAddress;
    }
    return value;
  }

  get port(): number {
    return this.envOverrides.port ?? this.getValueInt("port", DEFAULTS.port);
  }

  get sslPort(): number {
    return this.envOverrides.sslPort ?? this.getValueInt("sslPort", DEFAULTS.sslPort);
  }

  get enableSsl(): boolean {
    return this.envOverrides.enableSsl ?? this.getValueBoolean("enableSsl", DEFAULTS.enableSsl);
  }

  get launchBrowser(): boolean {
    return this.envOverrides.launchBrowser ?? this.getValueBoolean("launchBrowser", DEFAULTS.launchBrowser);
  }

  /**
   * Ported from ConfigFileProvider.ApiKey: generated once via
   * GenerateApiKey() if missing/blank, then persisted so it stays
   * stable across restarts.
   */
  get apiKey(): string {
    let apiKey = this.envOverrides.apiKey ?? this.getValue("apiKey", generateApiKey());

    if (!apiKey || !apiKey.trim()) {
      apiKey = generateApiKey();
      this.setValue("apiKey", apiKey);
    }

    return apiKey;
  }

  /** Ported from ConfigFileProvider.Execute(ResetApiKeyCommand): regenerate + persist a fresh API key. */
  resetApiKey(): string {
    const newKey = generateApiKey();
    this.setValue("apiKey", newKey);
    return newKey;
  }

  /**
   * Ported from ConfigFileProvider.AuthenticationMethod: if auth is
   * force-enabled via override, always Basic (and persists that choice).
   * Otherwise prefers an explicit override method, falling back to the
   * stored/default value.
   */
  get authenticationMethod(): AuthenticationType {
    const enabled = this.envOverrides.authenticationEnabled ?? false;

    if (enabled) {
      this.setValue("authenticationMethod", "Basic");
      return "Basic";
    }

    const overrideMethod = this.envOverrides.authenticationMethod;
    if (overrideMethod && (AUTHENTICATION_TYPE_VALUES as readonly string[]).includes(overrideMethod)) {
      return overrideMethod as AuthenticationType;
    }

    return this.getValueEnum(AUTHENTICATION_TYPE_VALUES, "authenticationMethod", DEFAULTS.authenticationMethod);
  }

  get authenticationRequired(): AuthenticationRequiredType {
    const overrideRequired = this.envOverrides.authenticationRequired;
    if (overrideRequired && (AUTHENTICATION_REQUIRED_TYPE_VALUES as readonly string[]).includes(overrideRequired)) {
      return overrideRequired as AuthenticationRequiredType;
    }

    return this.getValueEnum(
      AUTHENTICATION_REQUIRED_TYPE_VALUES,
      "authenticationRequired",
      DEFAULTS.authenticationRequired,
    );
  }

  get analyticsEnabled(): boolean {
    return this.envOverrides.analyticsEnabled ?? this.getValueBoolean("analyticsEnabled", DEFAULTS.analyticsEnabled, false);
  }

  get branch(): string {
    const value = this.envOverrides.branch ?? this.getValue("branch", DEFAULTS.branch);
    return value.toLowerCase();
  }

  get logLevel(): string {
    const value = this.envOverrides.logLevel ?? this.getValue("logLevel", DEFAULTS.logLevel);
    return value.toLowerCase();
  }

  get consoleLogLevel(): string {
    return this.envOverrides.consoleLogLevel ?? this.getValue("consoleLogLevel", DEFAULTS.consoleLogLevel, false);
  }

  get logSql(): boolean {
    return this.envOverrides.logSql ?? this.getValueBoolean("logSql", DEFAULTS.logSql, false);
  }

  get logRotate(): number {
    return this.envOverrides.logRotate ?? this.getValueInt("logRotate", DEFAULTS.logRotate, false);
  }

  get filterSentryEvents(): boolean {
    return this.envOverrides.filterSentryEvents ?? this.getValueBoolean("filterSentryEvents", DEFAULTS.filterSentryEvents, false);
  }

  get sslCertPath(): string {
    return this.envOverrides.sslCertPath ?? this.getValue("sslCertPath", DEFAULTS.sslCertPath);
  }

  get sslCertPassword(): string {
    return this.envOverrides.sslCertPassword ?? this.getValue("sslCertPassword", DEFAULTS.sslCertPassword);
  }

  /** Ported from ConfigFileProvider.UrlBase: trims slashes, then re-adds a single leading slash unless empty. */
  get urlBase(): string {
    const raw = this.envOverrides.urlBase ?? this.getValue("urlBase", DEFAULTS.urlBase);
    const trimmed = raw.replace(/^\/+|\/+$/g, "");

    if (!trimmed.trim()) {
      return trimmed;
    }

    return "/" + trimmed;
  }

  /**
   * Ported from ConfigFileProvider.InstanceName: falls back to the app
   * name if the stored value doesn't contain it (case-insensitively).
   */
  get instanceName(): string {
    const instanceName = this.envOverrides.instanceName ?? this.getValue("instanceName", DEFAULT_APP_NAME);

    if (instanceName.toLowerCase().includes(DEFAULT_APP_NAME.toLowerCase())) {
      return instanceName;
    }

    return DEFAULT_APP_NAME;
  }

  get updateAutomatically(): boolean {
    return (
      this.envOverrides.updateAutomatically ??
      this.getValueBoolean("updateAutomatically", DEFAULTS.updateAutomatically, false)
    );
  }

  get updateMechanism(): UpdateMechanism {
    const overrideMechanism = this.envOverrides.updateMechanism;
    if (overrideMechanism && (UPDATE_MECHANISM_VALUES as readonly string[]).includes(overrideMechanism)) {
      return overrideMechanism as UpdateMechanism;
    }

    return this.getValueEnum(UPDATE_MECHANISM_VALUES, "updateMechanism", DEFAULTS.updateMechanism, false);
  }

  get updateScriptPath(): string {
    return this.envOverrides.updateScriptPath ?? this.getValue("updateScriptPath", DEFAULTS.updateScriptPath, false);
  }

  get syslogServer(): string {
    return this.envOverrides.syslogServer ?? this.getValue("syslogServer", DEFAULTS.syslogServer, false);
  }

  get syslogPort(): number {
    return this.envOverrides.syslogPort ?? this.getValueInt("syslogPort", DEFAULTS.syslogPort, false);
  }

  get syslogLevel(): string {
    const value = this.envOverrides.syslogLevel ?? this.getValue("syslogLevel", this.logLevel, false);
    return value.toLowerCase();
  }

  get theme(): string {
    return this.envOverrides.theme ?? this.getValue("theme", DEFAULTS.theme, false);
  }

  get trustCgnatIpAddresses(): boolean {
    return (
      this.envOverrides.trustCgnatIpAddresses ??
      this.getValueBoolean("trustCgnatIpAddresses", DEFAULTS.trustCgnatIpAddresses, false)
    );
  }

  private getValueInt(key: string, defaultValue: number, persist = true): number {
    const value = this.getValue(key, defaultValue, persist);
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  private getValueBoolean(key: string, defaultValue: boolean, persist = true): boolean {
    const value = this.getValue(key, defaultValue, persist);
    return value.trim().toLowerCase() === "true";
  }

  private getValueEnum<T extends string>(allowed: readonly T[], key: string, defaultValue: T, persist = true): T {
    const value = this.getValue(key, defaultValue, persist);
    const match = allowed.find((candidate) => candidate.toLowerCase() === value.trim().toLowerCase());
    return match ?? defaultValue;
  }

  /**
   * Ported from ConfigFileProvider.GetValue(string key, object
   * defaultValue, bool persist = true). Reads (and caches) the value for
   * key from the on-disk file, persisting the default if absent and
   * persist is true.
   */
  getValue(key: string, defaultValue: unknown, persist = true): string {
    if (this.cache.has(key)) {
      return this.cache.get(key) as string;
    }

    const fileValues = this.loadConfigFile();

    if (Object.prototype.hasOwnProperty.call(fileValues, key) && fileValues[key] !== undefined && fileValues[key] !== null) {
      const stringValue = String(fileValues[key]).trim();
      this.cache.set(key, stringValue);
      return stringValue;
    }

    if (persist) {
      this.setValue(key, defaultValue as string | number | boolean);
    }

    const defaultString = String(defaultValue);
    this.cache.set(key, defaultString);
    return defaultString;
  }

  /** Ported from ConfigFileProvider.SetValue(string key, object value). */
  setValue(key: string, value: string | number | boolean): void {
    const fileValues = this.loadConfigFile();
    fileValues[key] = value;
    this.cache.set(key, String(value));
    this.saveConfigFile(fileValues);
  }

  /** Ported from ConfigFileProvider.EnsureDefaultConfigFile(). */
  ensureDefaultConfigFile(): void {
    if (!existsSync(this.configFilePath)) {
      this.saveConfigDictionary(this.getConfigDictionary());
    }
  }

  /**
   * Ported from ConfigFileProvider.HandleAsync(ApplicationStartedEvent):
   * runs the on-startup sequence (ensure the file exists, prune stale/
   * unknown keys). Exposed as a plain method since there is no ported
   * event-bus to auto-invoke it from yet -- callers (e.g. the server
   * bootstrap) call this explicitly at startup. (MigrateConfigFile's SSL
   * cert-hash migration is XML/legacy-specific and doesn't apply to a
   * fresh JSON-format bootstrap file, so it's omitted -- nothing in this
   * port ever wrote the old XML SslCertHash field.)
   */
  handleApplicationStarted(): void {
    this.ensureDefaultConfigFile();
    this.deleteOldValues();
  }

  /** Ported from ConfigFileProvider.DeleteOldValues(): strips keys from the file that no longer correspond to a known config property. */
  private deleteOldValues(): void {
    const fileValues = this.loadConfigFile();
    const knownKeys = new Set(Object.keys(this.getConfigDictionary()));

    let changed = false;
    for (const key of Object.keys(fileValues)) {
      if (!knownKeys.has(key)) {
        delete fileValues[key];
        changed = true;
      }
    }

    if (changed) {
      this.saveConfigFile(fileValues);
    }
  }

  /**
   * Ported from ConfigFileProvider.LoadConfigFile(): reads and parses the
   * bootstrap config file, raising InvalidConfigFileError for an empty or
   * corrupt file, or AccessDeniedConfigFileError on a permissions failure.
   * Returns an empty object if the file doesn't exist yet (mirrors the C#
   * source returning a fresh empty XDocument in that case).
   */
  private loadConfigFile(): Record<string, unknown> {
    let contents: string;

    try {
      if (!existsSync(this.configFilePath)) {
        return {};
      }

      contents = readFileSync(this.configFilePath, "utf-8");
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr && nodeErr.code === "EACCES") {
        throw new AccessDeniedConfigFileError(
          "Pagarr does not have access to config file: " + this.configFilePath + ". Please fix permissions",
          err,
        );
      }
      throw err;
    }

    if (!contents.trim()) {
      throw new InvalidConfigFileError(
        this.configFilePath + " is empty. Please delete the config file and Pagarr will recreate it.",
      );
    }

    try {
      const parsed = JSON.parse(contents) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new InvalidConfigFileError(
          this.configFilePath + " is invalid. Please delete the config file and Pagarr will recreate it.",
        );
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof InvalidConfigFileError) {
        throw err;
      }
      throw new InvalidConfigFileError(
        this.configFilePath + " is corrupt or invalid. Please delete the config file and Pagarr will recreate it.",
        err,
      );
    }
  }

  /** Ported from ConfigFileProvider.SaveConfigFile(XDocument). */
  private saveConfigFile(values: Record<string, unknown>): void {
    try {
      const dir = dirname(this.configFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configFilePath, JSON.stringify(values, null, 2) + "\n", "utf-8");
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr && nodeErr.code === "EACCES") {
        throw new AccessDeniedConfigFileError(
          "Pagarr does not have access to config file: " + this.configFilePath + ". Please fix permissions",
          err,
        );
      }
      throw err;
    }
  }
}
