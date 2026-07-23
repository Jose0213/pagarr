/**
 * Ported from NzbDrone.Core/Tags/TagService.cs.
 *
 * ## Cross-module dependencies not yet ported
 *
 * The real `TagService.Details()`/`Details(tagId)` collect the ids of every
 * other entity type that references a tag by querying eight sibling
 * services: `IDelayProfileService`, `IImportListFactory`,
 * `INotificationFactory`, `IReleaseProfileService`, `IAuthorService`,
 * `IIndexerFactory`, `IRootFolderService`, `IDownloadClientFactory`. None of
 * those modules exist yet in this port (Tags is a Phase 1 module; Books,
 * Indexers, Download, Notifications etc. are Phase 1-4, per PORT_PLAN.md) --
 * ThingiProvider/ProviderFactory<T>.AllForTag(tagId) is itself an unported
 * Phase-4 base class.
 *
 * Rather than hard-depend on eight not-yet-existing modules (or stub
 * `Details()` out entirely and silently drop the in-use check that's the
 * whole point of this service), `TagService` takes a `TagUsageProviders`
 * bag of narrow `{ allForTag(tagId): { id }[] }` collaborators in its
 * constructor -- one per C# dependency, matching the DI shape 1:1 -- with
 * every entry optional and defaulting to "reports nothing uses this tag"
 * when omitted. This preserves TagService's actual behavior/shape today
 * (delete-when-unused works correctly for whichever providers a caller
 * *does* wire up, e.g. once RootFolders lands later in Phase 1) without
 * blocking this module on unrelated ones. When each dependency module is
 * ported, its factory/service should be passed in here -- no TagService
 * changes required, since the shape was designed for that.
 *
 * `IAuthorService.AllForTag` in C# actually differs slightly from the other
 * seven (see AuthorService.GetAllAuthorTags returning a
 * `Dictionary<int, List<int>>` of authorId -> tagIds, filtered
 * `Where(c => c.Value.Contains(tag.Id))` in `Details()`'s bulk path, vs
 * `AuthorService.AllForTag(tagId)` returning `List<Author>` directly in the
 * single-tag `Details(tagId)` path) -- both call shapes are ported here as
 * the same `allForTag(tagId): { id }[]` contract since the *externally
 * observable result* (which author ids reference this tag) is identical
 * either way; the dictionary-vs-per-tag-query distinction was a C#-side
 * query efficiency, not user-visible behavior.
 *
 * ## No IEventAggregator
 *
 * Same deviation as config/configService.ts: `TagsUpdatedEvent` publication
 * is a plain optional `onTagsUpdated` callback instead of a real event bus,
 * since Messaging (Phase 4) isn't ported yet and `db/events.ts`'s
 * `IEventAggregator` is typed specifically for `ModelEvent<TModel>`
 * (BasicRepository's create/update/delete events), not arbitrary marker
 * events like this one.
 */

import { ModelConflictException } from "../db/errors.js";
import type { Tag } from "./tag.js";
import type { TagDetails } from "./tagDetails.js";
import { tagDetailsInUse } from "./tagDetails.js";
import type { TagRepository } from "./tagRepository.js";

/** Narrow collaborator contract each cross-module usage-provider satisfies. See module doc comment above. */
export interface TagUsageProvider {
  allForTag(tagId: number): { id: number }[];
}

/**
 * One optional provider per C# constructor dependency. Omitted entries
 * behave as if that entity type never references any tag (empty list),
 * which is also literally true today since none of those modules exist yet.
 */
export interface TagUsageProviders {
  delayProfiles?: TagUsageProvider;
  importLists?: TagUsageProvider;
  notifications?: TagUsageProvider;
  releaseProfiles?: TagUsageProvider;
  authors?: TagUsageProvider;
  indexers?: TagUsageProvider;
  rootFolders?: TagUsageProvider;
  downloadClients?: TagUsageProvider;
}

const EMPTY_PROVIDER: TagUsageProvider = { allForTag: () => [] };

export class TagService {
  private readonly providers: Required<TagUsageProviders>;

  constructor(
    private readonly repo: TagRepository,
    providers: TagUsageProviders = {},
    private readonly onTagsUpdated?: () => void
  ) {
    this.providers = {
      delayProfiles: providers.delayProfiles ?? EMPTY_PROVIDER,
      importLists: providers.importLists ?? EMPTY_PROVIDER,
      notifications: providers.notifications ?? EMPTY_PROVIDER,
      releaseProfiles: providers.releaseProfiles ?? EMPTY_PROVIDER,
      authors: providers.authors ?? EMPTY_PROVIDER,
      indexers: providers.indexers ?? EMPTY_PROVIDER,
      rootFolders: providers.rootFolders ?? EMPTY_PROVIDER,
      downloadClients: providers.downloadClients ?? EMPTY_PROVIDER,
    };
  }

  /** Ported from `TagService.GetTag(int tagId)`. */
  getTag(tagId: number): Tag;
  /** Ported from `TagService.GetTag(string tag)`. */
  getTag(tag: string): Tag;
  getTag(tagIdOrLabel: number | string): Tag {
    if (typeof tagIdOrLabel === "number") {
      return this.repo.get(tagIdOrLabel);
    }

    // Ported from `tag.All(char.IsDigit)`: a string of only digit characters
    // is treated as an id, anything else as a label. This matches C#'s
    // literal behavior including its edge case: an empty string satisfies
    // `"".All(char.IsDigit)` (vacuously true -- LINQ's All() on an empty
    // sequence is always true), so C# would go down the id branch and call
    // `int.Parse("")`, throwing FormatException. `[...""].every(...)` is
    // `true` the same way, so this also takes the id branch for "" and
    // calls `Number.parseInt("", 10)` -> `NaN` -> `repo.get(NaN)`, which
    // throws (Number.isInteger(NaN) is false, so it can't match any row) --
    // same "reject empty string as a tag id" outcome, different error type.
    if ([...tagIdOrLabel].every((c) => c >= "0" && c <= "9")) {
      return this.repo.get(Number.parseInt(tagIdOrLabel, 10));
    }

    return this.repo.getByLabel(tagIdOrLabel);
  }

  /** Ported from `TagService.Details(int tagId)`. */
  details(tagId: number): TagDetails {
    const tag = this.getTag(tagId);

    return {
      id: tagId,
      label: tag.label,
      delayProfileIds: this.providers.delayProfiles.allForTag(tagId).map((c) => c.id),
      importListIds: this.providers.importLists.allForTag(tagId).map((c) => c.id),
      notificationIds: this.providers.notifications.allForTag(tagId).map((c) => c.id),
      restrictionIds: this.providers.releaseProfiles.allForTag(tagId).map((c) => c.id),
      authorIds: this.providers.authors.allForTag(tagId).map((c) => c.id),
      indexerIds: this.providers.indexers.allForTag(tagId).map((c) => c.id),
      rootFolderIds: this.providers.rootFolders.allForTag(tagId).map((c) => c.id),
      downloadClientIds: this.providers.downloadClients.allForTag(tagId).map((c) => c.id),
    };
  }

  /** Ported from `TagService.Details()` (bulk, all tags). */
  detailsAll(): TagDetails[] {
    return this.all().map((tag) => this.details(tag.id));
  }

  /** Ported from `TagService.All()`: `_repo.All().OrderBy(t => t.Label).ToList()`. */
  all(): Tag[] {
    return this.repo.all().sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Ported from `TagService.Add(Tag tag)`. Returns the existing tag
   * unchanged (without inserting a duplicate, and WITHOUT lower-casing or
   * persisting the incoming `tag.label`) if a tag with this label already
   * exists -- matching the C# source's early return before the
   * `ToLowerInvariant()` call.
   */
  add(tag: Tag): Tag {
    const existingTag = this.repo.findByLabel(tag.label);

    if (existingTag !== undefined) {
      return existingTag;
    }

    const toInsert: Tag = { ...tag, label: tag.label.toLowerCase() };
    const inserted = this.repo.insert(toInsert);
    this.onTagsUpdated?.();

    return inserted;
  }

  /** Ported from `TagService.Update(Tag tag)`. */
  update(tag: Tag): Tag {
    const toUpdate: Tag = { ...tag, label: tag.label.toLowerCase() };
    const updated = this.repo.update(toUpdate);
    this.onTagsUpdated?.();

    return updated;
  }

  /**
   * Ported from `TagService.Delete(int tagId)`: refuses to delete a tag
   * that's still referenced by any other entity (`TagDetails.InUse`),
   * throwing `ModelConflictException` with the same message text as the C#
   * source (`"{Type} with ID {id} '{label}' cannot be deleted since it's
   * still in use"`). This repo's `ModelConflictException` takes a single
   * pre-formatted `message` (see db/errors.ts) rather than the C# ctor's
   * `(Type modelType, int modelId, string message)` -- the full C#-shaped
   * text is built here and passed through so the observable error message
   * matches exactly, without needing to change the shared exception class's
   * constructor for a single caller.
   */
  delete(tagId: number): void {
    const details = this.details(tagId);

    if (tagDetailsInUse(details)) {
      throw new ModelConflictException(
        `Tag with ID ${tagId} '${details.label}' cannot be deleted since it's still in use`
      );
    }

    this.repo.delete(tagId);
    this.onTagsUpdated?.();
  }
}
