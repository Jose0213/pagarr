/**
 * Barrel export for the DiskSpace module -- new small core module built
 * alongside its API resource controller (`http-api/resources/DiskSpace/`).
 * See diskSpaceService.ts's doc comment for what's faithfully ported (the
 * root-folder-backed path list) vs. documented forward-ref (OS mount
 * enumeration for the "other fixed disks" bonus rows).
 */
export * from "./diskSpace.js";
export * from "./diskSpaceService.js";
