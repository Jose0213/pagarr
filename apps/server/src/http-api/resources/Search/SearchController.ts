import { Router, type Request, type Response } from "express";
import type { Author, Book } from "../../../books/models.js";
import { MediaCoverEntity, MediaCoverTypes } from "../../../media-cover/mediaCover.js";
import type { IMapCoversToLocal } from "../../../media-cover/mediaCoverService.js";
import type {
  ISearchForNewEntity,
  NewEntitySearchResult,
} from "../../../metadata-source/interfaces.js";
import {
  authorToResource,
  bookToResource,
  editionToResource,
  type SearchResource,
} from "./SearchResource.js";

/**
 * Ported from Readarr.Api.V1/Search/SearchController.cs.
 *
 * ```csharp
 * [HttpGet]
 * public object Search([FromQuery] string term)
 * {
 *     var searchResults = _searchProxy.SearchForNewEntity(term);
 *     return MapToResource(searchResults).ToList();
 * }
 * ```
 *
 * ## Collaborators
 *
 * `ISearchForNewEntity` is the REAL, already-ported interface from
 * `metadata-source/interfaces.ts` (Phase-earlier module, not a forward
 * reference -- see that file's own "Scoping note", which documents that
 * `priorityMetadataService.ts` is the real fix replacing Readarr's single-
 * point-of-failure `BookInfoProxy`). Unlike the real C# `List<object>`
 * (heterogeneous author-then-book sequence, `is`-checked per element --
 * see SearchResource.cs's own doc comment on `NewEntitySearchResult`),
 * this port's `ISearchForNewEntity.searchForNewEntity` already returns a
 * discriminated union (`{ type: "author", author } | { type: "book", book
 * }`), so `mapToResource` below switches on `.type` instead of an
 * `instanceof`/`is` check -- same mapping outcome, TS-idiomatic dispatch.
 *
 * `IBuildFileNames.GetAuthorFolder` / `IMapCoversToLocal` are both REAL,
 * already-ported modules (`media-files-organize/organizer/fileNameBuilder.ts`'s
 * `FileNameBuilder.getAuthorFolder`, `media-cover/mediaCoverService.ts`'s
 * `IMapCoversToLocal`) -- not forward references, genuine existing
 * dependencies from earlier phases.
 *
 * `book.Editions.Value.Single(x => x.Monitored).Overview` (a
 * `LazyLoaded<List<Edition>>` access): this port's `Book.editions` is a
 * plain optional field a caller populates explicitly (see books/models.ts's
 * doc comment on dropping LazyLoaded) -- `mapBook` below reads
 * `book.editions` directly, matching the C# `.Single(x => x.Monitored)`
 * throwing behavior faithfully (`Single` throws if zero or more than one
 * edition is monitored) rather than silently falling back.
 */

/** Narrowed to the one method this controller needs from `IBuildFileNames` -- see this module's doc comment ("REAL, already-ported"). */
export interface AuthorFolderBuilder {
  getAuthorFolder(author: Author): string;
}

export interface SearchControllerOptions {
  searchProxy: ISearchForNewEntity;
  fileNameBuilder: AuthorFolderBuilder;
  coverMapper: IMapCoversToLocal;
}

/**
 * Ported from `SearchController.MapToResource(IEnumerable<object> results)`:
 * assigns a synthetic sequential `Id` (1-based, matching `var id = 1; ...
 * resource.Id = id++;`) per result, converts local cover URLs, and picks
 * the poster/cover image for `RemotePoster`/`RemoteCover`.
 */
function mapToResource(
  results: NewEntitySearchResult[],
  fileNameBuilder: AuthorFolderBuilder,
  coverMapper: IMapCoversToLocal
): SearchResource[] {
  let id = 1;
  const resources: SearchResource[] = [];

  for (const result of results) {
    const resource: SearchResource = { id: id++, foreignId: "" };

    if (result.type === "author") {
      resource.author = mapAuthor(result.author, fileNameBuilder, coverMapper);
      resource.foreignId = result.author.metadata?.foreignAuthorId ?? "";
    } else {
      resource.book = mapBook(result.book, fileNameBuilder, coverMapper);
      resource.foreignId = result.book.foreignBookId;
    }

    resources.push(resource);
  }

  return resources;
}

function mapAuthor(
  author: Author,
  fileNameBuilder: AuthorFolderBuilder,
  coverMapper: IMapCoversToLocal
): NonNullable<ReturnType<typeof authorToResource>> {
  // authorToResource() only returns null for a null/undefined input --
  // `author` here always comes from a real search result, never null.
  const resource = authorToResource(author)!;

  coverMapper.convertToLocalUrls(resource.id, MediaCoverEntity.Author, resource.images);

  const poster = resource.images.find(
    (c) => c.coverType === toCoverTypeString(MediaCoverTypes.Poster)
  );
  if (poster) {
    resource.remotePoster = poster.remoteUrl ?? null;
  }

  resource.folder = fileNameBuilder.getAuthorFolder(author);

  return resource;
}

function mapBook(
  book: Book,
  fileNameBuilder: AuthorFolderBuilder,
  coverMapper: IMapCoversToLocal
): NonNullable<ReturnType<typeof bookToResource>> {
  // bookToResource() only returns null for a null/undefined input --
  // `book` here always comes from a real search result, never null.
  const resource = bookToResource(book)!;

  // Ported: `book.Editions.Value.Single(x => x.Monitored).Overview` --
  // throws if there isn't EXACTLY one monitored edition, matching LINQ's
  // `Single(predicate)` (not `SingleOrDefault`).
  const editions = book.editions ?? [];
  const monitoredEditions = editions.filter((e) => e.monitored);
  if (monitoredEditions.length !== 1) {
    throw new Error("Sequence contains no matching element");
  }
  resource.overview = monitoredEditions[0]!.overview;

  if (book.author) {
    resource.author = authorToResource(book.author);
  }
  resource.editions = editions
    .map((e) => editionToResource(e))
    .filter((e): e is NonNullable<typeof e> => e !== null);

  // Ported: `_coverMapper.ConvertToLocalUrls(resource.Book.Id,
  // MediaCoverEntity.Book, resource.Book.Images)` -- the real BookResource's
  // `Images` come from the selected (monitored) edition's own images,
  // already populated by `bookToResource()` above (see BookResource.ts's
  // `bookToResource` -- `images: selectedEdition?.images ?? []`).
  coverMapper.convertToLocalUrls(resource.id, MediaCoverEntity.Book, resource.images);

  const cover = resource.images.find(
    (c) => c.coverType === toCoverTypeString(MediaCoverTypes.Cover)
  );
  if (cover) {
    resource.remoteCover = cover.remoteUrl;
  }

  if (resource.author) {
    resource.author.folder = fileNameBuilder.getAuthorFolder(book.author!);
  }

  return resource;
}

/** `MediaCoverImage.coverType` is stored as a plain string (see media-cover/mediaCover.ts's doc comment); this converts the enum value to its C# `.ToString()` equivalent name for the `find()` comparisons above. */
function toCoverTypeString(type: MediaCoverTypes): string {
  return MediaCoverTypes[type] ?? "";
}

/**
 * Builds the `SearchController` Express router (`GET /` -- global
 * author/book search, delegating to `metadata-source`'s
 * `ISearchForNewEntity`).
 */
export function searchController(options: SearchControllerOptions): Router {
  const { searchProxy, fileNameBuilder, coverMapper } = options;

  const router = Router();

  router.get("/", (req: Request, res: Response, next) => {
    void (async () => {
      try {
        const term = typeof req.query["term"] === "string" ? req.query["term"] : "";
        const searchResults = await searchProxy.searchForNewEntity(term);
        res.json(mapToResource(searchResults, fileNameBuilder, coverMapper));
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
