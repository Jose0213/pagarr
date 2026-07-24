import { Router } from "express";
import type { ISearchForNewAuthor } from "../../../metadata-source/index.js";
import {
  MediaCoverEntity,
  MediaCoverTypes,
  type IMapCoversToLocal,
} from "../../../media-cover/index.js";
import type { Author } from "../../../books/index.js";
import { authorToResource, type AuthorResource } from "./AuthorResource.js";

/**
 * Ported from Readarr.Api.V1/Author/AuthorLookupController.cs.
 *
 * `[V1ApiController("author/lookup")]` -> mount path `/api/v1/author/lookup`
 * (an explicit resource-name override -- see `AuthorController.ts`'s module
 * doc comment on the `[V1ApiController]` route convention). A plain
 * `Controller` in the real C# source with a single `[HttpGet]` action, so
 * this port returns a bare `Router` built directly, matching
 * `AuthorEditorController.ts`'s same non-`restController()` shape.
 *
 * `ISearchForNewAuthor` -- the real, already-ported interface from
 * `metadata-source/interfaces.ts` (implemented by `PriorityMetadataService`,
 * which itself fans out across the Hardcover/OpenLibrary/Google Books
 * providers -- see that module's doc comment for why this replaces the real
 * C# source's single `BookInfoProxy`/Goodreads-backed search, known-issue #1).
 * A caller wires up `authorLookupController({ searchProxy:
 * priorityMetadataService, ... })` to get the fixed, multi-provider-fallback
 * behavior "for free" -- this controller itself has no opinion on which
 * concrete `ISearchForNewAuthor` implementation it's handed, exactly
 * matching the real C# controller's DI-injected `ISearchForNewAuthor
 * _searchProxy` constructor parameter.
 *
 * `IBuildFileNames.GetAuthorFolder` -> `getAuthorFolder`, same optional-
 * narrow-callback shape as `AuthorController.ts`'s identically-named option
 * (see that file's doc comment) -- optional here too; when omitted, each
 * result's `folder` field is left `null` rather than thrown on, matching
 * this port's "narrower fidelity gap over blocking the whole controller on
 * Organizer wiring" convention established there.
 */

export interface AuthorLookupControllerOptions {
  searchProxy: Pick<ISearchForNewAuthor, "searchForNewAuthor">;
  coverMapper: IMapCoversToLocal;
  getAuthorFolder?: (author: Author) => string;
}

/**
 * Ported from `AuthorLookupController.MapToResource(IEnumerable<Author> author)`
 * (a C# iterator method -- ported as an eager array-building loop, matching
 * this port's established convention of not preserving C#'s lazy
 * `yield return` generators where the caller always immediately materializes
 * the full list anyway, as `Search()` does via `.ToList()`).
 */
function mapToResource(
  authors: Author[],
  coverMapper: IMapCoversToLocal,
  getAuthorFolder: ((author: Author) => string) | undefined
): AuthorResource[] {
  const results: AuthorResource[] = [];

  for (const author of authors) {
    const resource = authorToResource(author);
    if (resource === null) {
      continue;
    }

    coverMapper.convertToLocalUrls(resource.id, MediaCoverEntity.Author, resource.images);

    const poster = resource.images.find(
      (c) => c.coverType === mediaCoverTypeToString(MediaCoverTypes.Poster)
    );
    if (poster) {
      resource.remotePoster = poster.remoteUrl ?? null;
    }

    if (getAuthorFolder) {
      resource.folder = getAuthorFolder(author);
    }

    results.push(resource);
  }

  return results;
}

/**
 * `MediaCoverImage.coverType` (books/models.ts) is a plain `string`, not the
 * `MediaCoverTypes` numeric enum -- see that interface's doc comment
 * (`MediaCoverImage` is the narrow JSON-column shape, independent of the
 * richer `MediaCover` class `media-cover/mediaCover.ts` owns). This
 * controller's own `mapCoversToLocal`-equivalent call
 * (`coverMapper.convertToLocalUrls`) stamps `images` from
 * `AuthorMetadata.images`, whose `coverType` values are produced by whatever
 * mapped the metadata-source DTO in the first place (`metadata-source/
 * mapper.ts`) -- those already write the enum's string name (e.g.
 * `"Poster"`), matching `MediaCoverTypes.Poster.ToString()`'s C# formatting
 * (`Enum.ToString()` on a non-flags enum yields its member name). This
 * helper reproduces that exact string, rather than importing a separate
 * string-literal union, so the comparison stays anchored to the real enum
 * if `MediaCoverTypes` ever gets a member renumbered/renamed.
 */
function mediaCoverTypeToString(type: MediaCoverTypes): string {
  return MediaCoverTypes[type] ?? "";
}

export function authorLookupController(options: AuthorLookupControllerOptions): Router {
  const { searchProxy, coverMapper, getAuthorFolder } = options;
  const router = Router();

  /** Ported from `Search([FromQuery] string term)`: `GET /api/v1/author/lookup?term=...`. */
  router.get("/", (req, res, next) => {
    void (async () => {
      try {
        const term = typeof req.query["term"] === "string" ? req.query["term"] : "";
        const searchResults = await searchProxy.searchForNewAuthor(term);
        res.json(mapToResource(searchResults, coverMapper, getAuthorFolder));
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}
