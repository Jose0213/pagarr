/**
 * Barrel export for the CustomFilters module -- new small core module built
 * alongside its API resource controller (`http-api/resources/CustomFilters/`)
 * since no prior phase ported one. See customFilterRepository.ts's doc
 * comment for why this follows tags/'s `BasicRepository<TModel>` pattern.
 */
export * from "./customFilter.js";
export * from "./customFilterRepository.js";
export * from "./customFilterService.js";
