import { epubVersionToString, type EpubVersion } from "./epubVersion.js";
import type { EpubMetadata } from "./epubMetadata.js";

/**
 * Ported from VersOne.Epub.Schema/EpubPackage.cs. `GetVersionString()` is a
 * regular (non-property) method in C#, delegating to `VersionUtils` --
 * ported as a free function taking the package, matching this module's
 * computed-property convention.
 */
export interface EpubPackage {
  epubVersion: EpubVersion;
  metadata: EpubMetadata;
}

/** Ported from `EpubPackage.GetVersionString()`. */
export function epubPackageVersionString(pkg: EpubPackage): string {
  return epubVersionToString(pkg.epubVersion);
}
