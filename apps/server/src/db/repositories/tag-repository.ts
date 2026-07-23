/**
 * Back-compat re-export. The real Tags module port lives at
 * apps/server/src/tags/ (Tag, TagDetails, TagRepository, TagService,
 * TagsUpdatedEvent -- see tags/index.ts). This file originally held a
 * minimal `TagRepository` written during Phase 0 purely as an example of
 * the `BasicRepository<TModel>` pattern against a real table; that example
 * has now been superseded by the full port, so this just re-exports the
 * real thing to avoid a second, drifting definition of `Tag`/`TagRepository`.
 */
export { TagRepository } from "../../tags/tagRepository.js";
export type { Tag } from "../../tags/tag.js";
