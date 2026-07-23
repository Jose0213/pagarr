/**
 * Barrel export for the MetadataSource module -- port of interfaces/DTOs
 * from NzbDrone.Core/MetadataSource/*.cs, with Hardcover/OpenLibrary/Google
 * Books provider implementations replacing Readarr's real BookInfo/
 * Goodreads clients. See interfaces.ts's module doc comment for the full
 * rationale (known-issues-fixlist.md #1) and this module's final report
 * for what's ported faithfully vs. replaced.
 */

export * from "./interfaces.js";
export * from "./dto.js";
export * from "./errors.js";
export * from "./mapper.js";
export * from "./metadataRequestBuilder.js";
export * from "./priorityMetadataService.js";

export * from "./hardcover/provider.js";
export * from "./open-library/provider.js";
export * from "./google-books/provider.js";
