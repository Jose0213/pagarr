import { levenshteinDistance } from "../../../parser/stringMatching.js";
import { authorResourceToModel, type AuthorResource } from "./AuthorResource.js";

/**
 * Ported from Readarr.Api.V1/Author/AuthorFolderAsRootFolderValidator.cs.
 *
 * A `PropertyValidator` applied to `AuthorResource.RootFolderPath` on POST
 * (see `AuthorController.ts`'s `PostValidator.RuleFor(s =>
 * s.RootFolderPath)...SetValidator(authorFolderAsRootFolderValidator)`):
 * catches the case where a user picks a root folder that's ALREADY the
 * author's own folder (e.g. re-selecting `/books/Stephen King` as the root
 * folder instead of `/books`), which would nest the author's books one
 * level too deep. Ported as a plain predicate over the full `AuthorResource`
 * (not just the `rootFolderPath` property value) since the real C#
 * validator reaches into `context.ParentContext.InstanceToValidate` to get
 * at the sibling `AuthorResource` fields it needs to compute the expected
 * author folder name -- this port's `restController()` has no FluentValidation
 * parent-context concept (see `RestController.ts`'s module doc comment), so
 * every field the real validator would reach for is passed explicitly
 * instead.
 *
 * `IBuildFileNames.GetAuthorFolder` -> `getAuthorFolder` parameter, matching
 * `media-files-organize/organizer/fileNameBuilder.ts`'s
 * `FileNameBuilder.getAuthorFolder(author)` bound method (a caller wires
 * `authorFolderAsRootFolderValidator(fileNameBuilder.getAuthorFolder.bind(fileNameBuilder), ...)`
 * or an equivalent closure -- kept as a narrow function-shaped dependency
 * here, matching this port's established "narrow the collaborator to just
 * what's called" convention, rather than importing the concrete
 * `FileNameBuilder` class directly).
 */

export interface AuthorFolderAsRootFolderValidationResult {
  isValid: boolean;
  /** Only meaningful when `isValid` is false -- the `{rootFolderPath}`/`{authorFolder}` message-formatter arguments the real C# validator appends via `context.MessageFormatter.AppendArgument`, matching `GetDefaultMessageTemplate()`'s `"Root folder path '{rootFolderPath}' contains author folder '{authorFolder}'"`. */
  rootFolderPath?: string;
  authorFolder?: string;
}

/**
 * Ported from `AuthorFolderAsRootFolderValidator.IsValid(PropertyValidatorContext context)`.
 *
 *   1. `null`/unset `rootFolderPath` -> valid (nothing to check).
 *   2. `context.ParentContext.InstanceToValidate is not AuthorResource` ->
 *      valid -- unreachable in this port (the validator is only ever wired
 *      against an `AuthorResource`'s own field, there's no other resource
 *      type it could be applied to structurally), kept as a no-op branch
 *      note rather than a runtime check since TS's type system already
 *      enforces the parameter is an `AuthorResource`.
 *   3. Blank (whitespace-only) `rootFolderPath` -> valid.
 *   4. Otherwise: compute the LAST path segment of `rootFolderPath` (C#'s
 *      `new DirectoryInfo(rootFolderPath).Name`) and the author's own
 *      folder name (via `fileNameBuilder.GetAuthorFolder`), then:
 *        - exact match -> INVALID.
 *        - otherwise, invalid iff the Levenshtein distance between the two
 *          names is LESS than `max(1, authorFolder.length * 0.2)` (i.e.
 *          "too similar to be a coincidence" -- names that differ by more
 *          than that threshold are allowed through, since they're
 *          presumably genuinely different folders).
 */
export function isValidAuthorFolderAsRootFolder(
  getAuthorFolder: (resource: ReturnType<typeof authorResourceToModel>) => string,
  authorResource: AuthorResource,
  rootFolderPath: string | null | undefined
): AuthorFolderAsRootFolderValidationResult {
  if (rootFolderPath === null || rootFolderPath === undefined) {
    return { isValid: true };
  }

  if (rootFolderPath.trim() === "") {
    return { isValid: true };
  }

  const rootFolderName = directoryName(rootFolderPath);
  const author = authorResourceToModel(authorResource);
  const authorFolder = getAuthorFolder(author);

  const result: AuthorFolderAsRootFolderValidationResult = {
    isValid: true,
    rootFolderPath,
    authorFolder,
  };

  if (authorFolder === rootFolderName) {
    result.isValid = false;
    return result;
  }

  const distance = levenshteinDistance(authorFolder, rootFolderName);
  const threshold = Math.max(1, authorFolder.length * 0.2);

  result.isValid = distance >= threshold;
  return result;
}

/** Ported from `new DirectoryInfo(rootFolderPath).Name`: the final path segment, cross-platform-separator-agnostic (matches `path-utils.ts`'s established separator handling elsewhere in this port). */
function directoryName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}
