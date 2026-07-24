import {
  AuthorStatusType,
  NewItemMonitorTypes,
  type AddAuthorOptions,
  type Author,
  type AuthorMetadata,
  type Book,
  type Links,
  type MediaCoverImage,
  type Ratings,
} from "../../../books/index.js";
import type { RestResource } from "../../rest/RestResource.js";
import {
  newAuthorStatisticsResource,
  type AuthorStatisticsResource,
} from "./AuthorStatisticsResource.js";

/**
 * Ported from Readarr.Api.V1/Author/AuthorResource.cs.
 *
 * `[JsonIgnore] AuthorMetadataId` is dropped from the wire shape here the
 * same way -- kept as a field on the TS interface (so mapping code has
 * somewhere to carry it internally, matching the real C# object graph
 * exactly) but callers writing the JSON response must omit it explicitly;
 * `authorResourceToWire()` below does that, matching `[JsonIgnore]`'s
 * effect on `System.Text.Json` serialization (this port has no attribute-
 * driven serializer, so the "ignore on write" behavior is reproduced as an
 * explicit stripping step at the one place a resource is ever actually
 * serialized -- the REST controller's response body -- rather than at the
 * type level, matching this port's established RestResource.ts convention
 * of doing the equivalent for `Id`'s `JsonIgnoreCondition.WhenWritingDefault`
 * via `stripDefaultId()`).
 *
 * `Ended` is a computed C# property (`Status == AuthorStatusType.Ended`) --
 * ported as `authorEnded()` below rather than a stored field, same
 * computed-property convention as AuthorStatisticsResource.ts's
 * `percentOfBooks`. `authorResourceToWire()` stamps it into the wire object
 * since C#'s JSON serializer includes every property, computed or not.
 */
export interface AuthorResource extends RestResource {
  /** `[JsonIgnore]` in the real C# source -- see module doc comment. Not part of the wire shape; use `authorResourceToWire()` when serializing. */
  authorMetadataId: number;
  status: AuthorStatusType;

  authorName: string;
  authorNameLastFirst: string;
  foreignAuthorId: string;
  titleSlug: string;
  overview: string | null;
  disambiguation: string | null;
  links: Links[];

  nextBook: Book | null;
  lastBook: Book | null;

  images: MediaCoverImage[];

  remotePoster: string | null;

  // View & Edit
  path: string;
  qualityProfileId: number;
  metadataProfileId: number;

  // Editing Only
  monitored: boolean;
  monitorNewItems: NewItemMonitorTypes;

  rootFolderPath: string;
  folder: string | null;
  genres: string[];
  cleanName: string;
  sortName: string;
  sortNameLastFirst: string;

  tags: number[];
  added: string | null;
  addOptions: AddAuthorOptions | null;
  ratings: Ratings;

  statistics: AuthorStatisticsResource | null;
}

/** The actual JSON-wire shape written to the HTTP response -- `authorMetadataId` (`[JsonIgnore]`) dropped, `ended` (computed getter) added. See module doc comment. */
export type AuthorResourceWire = Omit<AuthorResource, "authorMetadataId"> & { ended: boolean };

/** Ported from `AuthorResource.Ended => Status == AuthorStatusType.Ended`. */
export function authorEnded(resource: Pick<AuthorResource, "status">): boolean {
  return resource.status === AuthorStatusType.Ended;
}

/** Ported from the JSON-serialization boundary's `[JsonIgnore]`/computed-getter handling -- see module doc comment. Apply immediately before `res.json(...)` (after `stripDefaultId`, which operates on the still-`id`-bearing `AuthorResource` shape). */
export function authorResourceToWire(resource: AuthorResource): AuthorResourceWire {
  const { authorMetadataId: _authorMetadataId, ...rest } = resource;
  return { ...rest, ended: authorEnded(resource) };
}

/** Ported from `AuthorResourceMapper.ToResource(this NzbDrone.Core.Books.Author model)`. Returns null for a null model, matching the C# source's own null-check (called from contexts like `GetAuthorResource` that may be handed a not-found lookup result). */
export function authorToResource(model: Author | null | undefined): AuthorResource | null {
  if (model === null || model === undefined) {
    return null;
  }

  const metadata = requireMetadata(model);

  return {
    id: model.id,
    authorMetadataId: model.authorMetadataId,

    authorName: model.metadata?.name ?? "",
    authorNameLastFirst: metadata.nameLastFirst,

    // AlternateTitles -- see AlternateTitleResource.ts's doc comment; not wired to this resource in the real C# source either.
    sortName: metadata.sortName,
    sortNameLastFirst: metadata.sortNameLastFirst,

    status: metadata.status,
    overview: metadata.overview,
    disambiguation: metadata.disambiguation,

    images: jsonClone(metadata.images),

    path: model.path,
    qualityProfileId: model.qualityProfileId,
    metadataProfileId: model.metadataProfileId,
    links: metadata.links,

    monitored: model.monitored,
    monitorNewItems: model.monitorNewItems,

    cleanName: model.cleanName,
    foreignAuthorId: metadata.foreignAuthorId,
    titleSlug: metadata.titleSlug,

    // Root folder path is now calculated from the author path -- ported
    // comment preserved verbatim; see AuthorController.ts's LinkRootFolderPath.
    rootFolderPath: "",
    genres: metadata.genres,
    tags: model.tags,
    added: model.added,
    addOptions: model.addOptions ?? null,
    ratings: metadata.ratings,

    statistics: newAuthorStatisticsResource(),

    nextBook: null,
    lastBook: null,
    remotePoster: null,
    folder: null,
  };
}

/** Ported from `AuthorResourceMapper.ToModel(this AuthorResource resource)`. Returns null for a null resource, matching the C# source. */
export function authorResourceToModel(resource: AuthorResource | null | undefined): Author | null {
  if (resource === null || resource === undefined) {
    return null;
  }

  const metadata: Omit<AuthorMetadata, "id"> & { id: number } = {
    id: 0,
    foreignAuthorId: resource.foreignAuthorId,
    titleSlug: resource.titleSlug,
    name: resource.authorName,
    nameLastFirst: resource.authorNameLastFirst,
    sortName: resource.sortName,
    sortNameLastFirst: resource.sortNameLastFirst,
    status: resource.status,
    overview: resource.overview,
    disambiguation: resource.disambiguation,
    links: resource.links,
    images: resource.images,
    genres: resource.genres,
    ratings: resource.ratings,
    // Fields the C# `AuthorMetadata` object also carries but
    // `AuthorResourceMapper.ToModel` never sets explicitly (left at the C#
    // default-constructed values: null/empty) -- ported the same way via
    // this port's `newAuthorMetadata()` defaults for shape fidelity.
    aliases: [],
    gender: null,
    hometown: null,
    born: null,
    died: null,
  };

  return {
    id: resource.id,

    metadata,

    // AlternateTitles -- not wired, see module doc comment.
    path: resource.path,
    qualityProfileId: resource.qualityProfileId,
    metadataProfileId: resource.metadataProfileId,

    monitored: resource.monitored,
    monitorNewItems: resource.monitorNewItems,

    cleanName: resource.cleanName,
    rootFolderPath: resource.rootFolderPath,

    tags: resource.tags,
    added: resource.added,
    addOptions: resource.addOptions ?? undefined,

    // Fields on the port's `Author` interface the C# `ToModel()` doesn't
    // set explicitly (left at defaults, matching a fresh
    // `new NzbDrone.Core.Books.Author()`'s implicit zero values).
    authorMetadataId: 0,
    lastInfoSync: null,
  };
}

/**
 * Ported from `AuthorResourceMapper.ToModel(this AuthorResource resource,
 * NzbDrone.Core.Books.Author author)`: maps onto a fresh model via
 * `ToModel()` then applies it onto the supplied existing `author` via
 * `Author.ApplyChanges` (see books/models.ts's `applyChangesAuthor`).
 */
export function authorResourceToModelMerge(resource: AuthorResource, author: Author): Author {
  const updated = authorResourceToModel(resource);
  if (updated === null) {
    throw new Error("authorResourceToModelMerge: resource must not be null");
  }

  return applyChangesAuthorLocal(author, updated);
}

/**
 * Ported from `Author.ApplyChanges(Author other)` -- re-declared here rather
 * than importing `books/models.ts`'s `applyChangesAuthor` because that
 * function's signature is `(existing, other) => Author` where `other` is
 * expected to be a full `Author` with `.metadata` etc. populated the way a
 * genuinely-fetched row would have it; the resource-mapped `updated` value
 * here only has the handful of fields `ToModel()` actually sets (see
 * `authorResourceToModel` above), matching the real C# call chain exactly
 * (`resource.ToModel()` also only sets a subset before `ApplyChanges` is
 * invoked on it). Delegates to the real ported function directly -- this is
 * just a thin, explicitly-named pass-through kept local for readability at
 * this file's own call site, not a reimplementation.
 */
function applyChangesAuthorLocal(existing: Author, other: Author): Author {
  return {
    ...existing,
    path: other.path,
    qualityProfileId: other.qualityProfileId,
    books: other.books,
    tags: other.tags,
    addOptions: other.addOptions,
    rootFolderPath: other.rootFolderPath,
    monitored: other.monitored,
    monitorNewItems: other.monitorNewItems,
    metadataProfileId: other.metadataProfileId,
  };
}

/** Ported from `AuthorResourceMapper.ToResource(this IEnumerable<Author> author)`. */
export function authorsToResources(authors: Iterable<Author>): AuthorResource[] {
  const result: AuthorResource[] = [];
  for (const author of authors) {
    const resource = authorToResource(author);
    if (resource !== null) {
      result.push(resource);
    }
  }
  return result;
}

/** Ported from `AuthorResourceMapper.ToModel(this IEnumerable<AuthorResource> resources)`. */
export function authorResourcesToModels(resources: Iterable<AuthorResource>): Author[] {
  const result: Author[] = [];
  for (const resource of resources) {
    const model = authorResourceToModel(resource);
    if (model !== null) {
      result.push(model);
    }
  }
  return result;
}

/**
 * The real C# `ToResource()` reads `model.Metadata.Value.*` unconditionally
 * (a `LazyLoaded<AuthorMetadata>` that's always populated by the time a
 * genuinely-fetched `Author` reaches this mapper, since `AuthorRepository`'s
 * joined queries -- see books/authorRepository.ts's module doc comment --
 * always hydrate `.metadata`). This port's `Author.metadata` is a plain
 * optional field (see books/models.ts's LazyLoaded doc comment), so callers
 * that pass an author fetched via a metadata-populating repository method
 * (which is every real call site in AuthorController.ts) are safe; this
 * throws loudly rather than silently reading undefined fields if a caller
 * ever passes one that wasn't hydrated, which is more useful than a NRE
 * would have been in the original.
 */
function requireMetadata(author: Author): AuthorMetadata {
  if (!author.metadata) {
    throw new Error(`authorToResource: Author ${author.id} has no populated .metadata`);
  }
  return author.metadata;
}

/**
 * Ported from `NzbDrone.Common.Extensions.JsonClone` as used on `Images` --
 * a deep clone via JSON round-trip, preventing the resource's `images`
 * array from aliasing the model's own array (so later resource-only
 * mutation, e.g. `MediaCoverService.convertToLocalUrls` rewriting `.url` in
 * place, doesn't corrupt the stored model).
 *
 * Explicit `null`/`undefined` short-circuit: the real C# `source.ToJson()`
 * on a `null` reference (e.g. an `Images` list a hand-built/request-derived
 * `Author.Metadata` never populated) serializes to the JSON literal `null`,
 * and `Json.Deserialize<T>("null")` hands back `null` -- a graceful no-op
 * round trip, never a parse error. `JSON.stringify(undefined)` returns the
 * *string* `"undefined"` (not valid JSON), which would make
 * `JSON.parse(JSON.stringify(undefined))` throw a `SyntaxError` instead of
 * mirroring that null-safe behavior -- reproduced here explicitly rather
 * than relying on `JSON.stringify`/`JSON.parse`'s divergent-from-C#
 * handling of the no-value case.
 */
function jsonClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
