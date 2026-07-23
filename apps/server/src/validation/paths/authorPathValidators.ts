/**
 * Ported from NzbDrone.Core/Validation/Paths/{AuthorAncestorValidator,
 * AuthorExistsValidator,AuthorPathValidator}.cs. Take `IAuthorService`; this
 * port has no separate `IAuthorService` interface (books/authorService.ts
 * exports only the concrete `AuthorService` class, no interface extracted
 * yet), so these are typed against a narrow structural shape (`Pick`-style)
 * matching the three real methods used: `findById`, `allAuthorPaths`.
 */
import type { AuthorService } from "../../books/authorService.js";
import { isParentPath, pathEquals } from "../../root-folders/path-utils.js";

type AuthorPathLookup = Pick<AuthorService, "allAuthorPaths">;
type AuthorLookup = Pick<AuthorService, "findById">;

/**
 * Ported from AuthorAncestorValidator.IsValid(): null is valid; otherwise
 * fails if the candidate path is a parent (ancestor at any depth) of any
 * existing author's path.
 */
export function isNotAncestorOfExistingAuthor(
  authorService: AuthorPathLookup,
  path: string | null | undefined
): boolean {
  if (path === null || path === undefined) {
    return true;
  }

  for (const authorPath of authorService.allAuthorPaths().values()) {
    if (isParentPath(path, authorPath)) {
      return false;
    }
  }

  return true;
}

/**
 * Ported from AuthorExistsValidator.IsValid(): null is valid; otherwise
 * fails (author "already added") if `FindById(foreignAuthorId)` returns a
 * match. Note the C# property is the author's *foreign* id (e.g. a
 * Goodreads/Hardcover author id string), not the local numeric `Id`.
 */
export function isNewAuthor(
  authorService: AuthorLookup,
  foreignAuthorId: string | null | undefined
): boolean {
  if (foreignAuthorId === null || foreignAuthorId === undefined) {
    return true;
  }

  return authorService.findById(foreignAuthorId) === undefined;
}

/**
 * Ported from AuthorPathValidator.IsValid(): null is valid; otherwise fails
 * if any OTHER author (`s.Key != instanceId`, i.e. excluding the author
 * being validated itself, identified by its local numeric id -- C#'s
 * `dynamic instance = context.ParentContext.InstanceToValidate; var
 * instanceId = (int)instance.Id`) already has a path-equal path.
 *
 * `instanceId` is passed explicitly here rather than reflected off a
 * dynamic parent-context object (no FluentValidation `RuleFor`/parent-model
 * access in this port -- see this file's module doc comment).
 */
export function isNotAnotherAuthorsPath(
  authorService: AuthorPathLookup,
  path: string | null | undefined,
  instanceId: number
): boolean {
  if (path === null || path === undefined) {
    return true;
  }

  for (const [id, authorPath] of authorService.allAuthorPaths()) {
    if (pathEquals(authorPath, path) && id !== instanceId) {
      return false;
    }
  }

  return true;
}
