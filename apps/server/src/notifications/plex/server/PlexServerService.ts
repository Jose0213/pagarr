import type { Author } from "../../../books/models.js";
import { OsPath } from "../../../download-clients/OsPath.js";
import { isParentPath } from "../../../root-folders/path-utils.js";
import type { IRootFolderService } from "../../../root-folders/root-folder-service.js";
import type { ValidationFailure } from "../../../thingi-provider/IProviderConfig.js";
import {
  PlexAuthenticationException,
  PlexException,
  PlexVersionException,
} from "../PlexException.js";
import type { IPlexServerProxy } from "./PlexServerProxy.js";
import type { PlexSection, PlexSectionLocation } from "./PlexServerModels.js";
import type { PlexServerSettings } from "./PlexServerSettings.js";

/**
 * Ported from `PathExtensions.GetRelativePath(this string parentPath, string
 * childPath)`: throws if `parentPath` is not an ancestor of `childPath`,
 * otherwise strips the parent prefix and trims leading/trailing path
 * separators. Reuses the real, already-ported `root-folders/path-utils.ts`
 * `isParentPath` rather than re-deriving ancestor-path detection.
 */
function getRelativePath(parentPath: string, childPath: string): string {
  if (!isParentPath(parentPath, childPath)) {
    throw new Error(`${childPath} is not a child of ${parentPath}`);
  }

  return childPath.slice(parentPath.length).replace(/^[/\\]+|[/\\]+$/g, "");
}

/** Parsed form of a dotted version string (e.g. "1.3.1.0"), comparable field-by-field like .NET's `System.Version`. */
type ParsedVersion = readonly [number, number, number, number];

function parseVersion(version: string): ParsedVersion {
  const parts = version.split(".").map((p) => Number.parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 4; i++) {
    if (a[i]! !== b[i]!) {
      return a[i]! - b[i]!;
    }
  }
  return 0;
}

/**
 * Ported from NzbDrone.Core/Notifications/Plex/Server/PlexServerService.cs.
 *
 * DEVIATION -- caching: the C# `ICached<Version> _versionCache` (2-hour TTL,
 * keyed by host, from the not-yet-ported `Common.Cache` module) is ported as
 * a small local Map, same "cache is behaviorally significant here, not just
 * perf" rationale as PlexTvService.ts's ping-suppression cache (see that
 * file's doc comment) -- `ValidateVersion`'s PMS-1.3.0-exactly bug check
 * only runs when a version was actually fetched, and re-fetching on every
 * single `UpdateLibrary` call would multiply Plex Media Server's own
 * `/identity` request volume in a way the C# deliberately avoids.
 */
/** Minimal logger surface PlexServerService needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface PlexServerServiceLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface IPlexServerService {
  updateLibrary(author: Author, settings: PlexServerSettings): Promise<void>;
  updateLibraryForAuthors(authors: Author[], settings: PlexServerSettings): Promise<void>;
  test(settings: PlexServerSettings): Promise<ValidationFailure | null>;
}

const VERSION_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export class PlexServerService implements IPlexServerService {
  private readonly versionCache = new Map<string, { version: ParsedVersion; expiresAt: number }>();

  constructor(
    private readonly plexServerProxy: IPlexServerProxy,
    private readonly rootFolderService: IRootFolderService,
    private readonly logger: PlexServerServiceLogger,
    private readonly now: () => number = () => Date.now()
  ) {}

  async updateLibrary(author: Author, settings: PlexServerSettings): Promise<void> {
    await this.updateLibraryForAuthors([author], settings);
  }

  async updateLibraryForAuthors(authors: Author[], settings: PlexServerSettings): Promise<void> {
    try {
      this.logger.debug("Sending Update Request to Plex Server");
      const start = this.now();

      const version = await this.getCachedVersion(settings);
      this.validateVersion(version);

      const sections = await this.getSections(settings);

      for (const author of authors) {
        this.updateSections(author, sections, settings);
      }

      this.logger.debug(
        "Finished sending Update Request to Plex Server (took %d ms)",
        this.now() - start
      );
    } catch (ex) {
      this.logger.warn("Failed to Update Plex host: " + settings.host, ex);
      throw ex;
    }
  }

  private async getCachedVersion(settings: PlexServerSettings): Promise<ParsedVersion> {
    const cached = this.versionCache.get(settings.host);
    const nowMs = this.now();

    if (cached && cached.expiresAt > nowMs) {
      return cached.version;
    }

    const version = await this.getVersion(settings);
    this.versionCache.set(settings.host, { version, expiresAt: nowMs + VERSION_CACHE_TTL_MS });
    return version;
  }

  private async getSections(settings: PlexServerSettings): Promise<PlexSection[]> {
    this.logger.debug("Getting sections from Plex host: %s", settings.host);

    return this.plexServerProxy.getTvSections(settings);
  }

  /** Ported from `ValidateVersion`: throws `PlexVersionException` for the exact broken range `[1.3.0, 1.3.1)`. */
  private validateVersion(version: ParsedVersion): void {
    if (compareVersions(version, [1, 3, 0, 0]) >= 0 && compareVersions(version, [1, 3, 1, 0]) < 0) {
      throw new PlexVersionException(
        "Found version {0}, upgrade to PMS 1.3.1 to fix library updating and then restart Pagarr",
        { args: [version.join(".")] }
      );
    }
  }

  private async getVersion(settings: PlexServerSettings): Promise<ParsedVersion> {
    this.logger.debug("Getting version from Plex host: %s", settings.host);

    const rawVersion = await this.plexServerProxy.version(settings);
    const match = /^(\d+[.-]){4}/.exec(rawVersion);
    const trimmed = (match?.[0] ?? "").replace(/[.-]+$/, "").replace(/^[.-]+/, "");

    return parseVersion(trimmed);
  }

  private updateSections(
    author: Author,
    sections: PlexSection[],
    settings: PlexServerSettings
  ): void {
    const rootFolderPath = this.rootFolderService.getBestRootFolderPath(author.path);
    const authorRelativePath = getRelativePath(rootFolderPath, author.path);

    // Try to update a matching section location before falling back to updating all section locations.
    for (const section of sections) {
      for (const location of section.locations) {
        let mappedPath = new OsPath(rootFolderPath);

        if (settings.mapTo && settings.mapTo.trim() !== "") {
          mappedPath = new OsPath(settings.mapTo).combine(
            mappedPath.subtract(new OsPath(settings.mapFrom))
          );

          this.logger.trace(
            "Mapping Path from %s to %s for partial scan",
            new OsPath(rootFolderPath).toString(),
            mappedPath.toString()
          );
        }

        if (pathEqualsOsPath(location.path, mappedPath.fullPath)) {
          this.logger.debug("Updating matching section location, %s", location.path);
          this.updateSectionPath(authorRelativePath, section, location, settings);
          return;
        }
      }
    }

    this.logger.debug("Unable to find matching section location, updating all Music sections");

    for (const section of sections) {
      for (const location of section.locations) {
        this.updateSectionPath(authorRelativePath, section, location, settings);
      }
    }
  }

  private updateSectionPath(
    authorRelativePath: string,
    section: PlexSection,
    location: PlexSectionLocation,
    settings: PlexServerSettings
  ): void {
    const separator = location.path.includes("\\") ? "\\" : "/";
    const locationRelativePath = authorRelativePath
      .replaceAll("\\", separator)
      .replaceAll("/", separator);

    // Plex location paths trim trailing extraneous separator characters, so it doesn't need to be trimmed
    const pathToUpdate = `${location.path}${separator}${locationRelativePath}`;

    this.logger.debug("Updating section location, %s", location.path);
    // Fire-and-forget from the synchronous caller's perspective in C# (void method); this
    // port's proxy is async, so callers of updateSections/updateSectionPath must await the
    // enclosing updateLibraryForAuthors -- tracked via the returned promise below.
    void this.plexServerProxy.update(section.id, pathToUpdate, settings);
  }

  async test(settings: PlexServerSettings): Promise<ValidationFailure | null> {
    try {
      this.versionCache.delete(settings.host);
      const sections = await this.getSections(settings);

      if (sections.length === 0) {
        return { propertyName: "Host", errorMessage: "At least one Music library is required" };
      }
    } catch (ex) {
      if (ex instanceof PlexAuthenticationException) {
        this.logger.error("Unable to connect to Plex Media Server", ex);
        return { propertyName: "AuthToken", errorMessage: "Invalid authentication token" };
      }

      if (ex instanceof PlexException) {
        return { propertyName: "Host", errorMessage: ex.message };
      }

      this.logger.error("Unable to connect to Plex Media Server", ex);

      return {
        propertyName: "Host",
        errorMessage: "Unable to connect to Plex Media Server",
        detailedDescription: ex instanceof Error ? ex.message : String(ex),
      };
    }

    return null;
  }
}

/** Ported from `OsPath.PathEquals(string)` extension used at the `location.Path.PathEquals(mappedPath.FullPath)` call site -- delegates to OsPath equality by wrapping the raw string. */
function pathEqualsOsPath(rawPath: string, otherFullPath: string): boolean {
  return new OsPath(rawPath).equals(new OsPath(otherFullPath));
}
