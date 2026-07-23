import { AUTHOR_NAME_REGEX, BOOK_TITLE_REGEX, PART_REGEX } from "./fileNameBuilder.js";

/**
 * Ported from NzbDrone.Core/Organizer/FileNameValidation.cs.
 *
 * C# expresses this as FluentValidation rule-builder extension methods
 * (`ValidBookFormat`/`ValidAuthorFolderFormat`) plus two
 * `PropertyValidator` subclasses. This repo has no FluentValidation
 * equivalent ported yet, so this is ported as plain predicate/validation
 * functions returning a validation-failure message (or `null` when valid) --
 * the same "no framework, direct behavior" approach this port takes
 * elsewhere for un-ported cross-cutting frameworks (see e.g.
 * profiles/errors.ts for the analogous FluentValidation-free pattern).
 */

// eslint-disable-next-line no-control-regex -- intentional: .NET's Path.GetInvalidPathChars() includes ASCII control characters 0-31, which is exactly what this ports (see validateIllegalCharacters's doc comment).
const INVALID_PATH_CHARS_REGEX = /[<>:"|?*\x00-\x1f]/g;

/** Ported from `FileNameValidation.OriginalTokenRegex`. */
export const ORIGINAL_TOKEN_REGEX = /(\{original[- ._](?:title|filename)\})/gi;

/**
 * Ported from `IllegalCharactersValidator.IsValid`: checks the value
 * against `Path.GetInvalidPathChars()`. .NET's invalid-path-chars set is
 * platform-dependent but always includes control characters 0-31 plus a
 * handful of reserved characters; ported here as the practical fixed set
 * .NET actually returns on the OSes this project targets (Windows/Linux),
 * matching the reserved characters `FileNameBuilder.CleanFileName` itself
 * treats as illegal (`< > : " | ? *`) plus control characters.
 */
export function validateIllegalCharacters(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  const matches = value.match(INVALID_PATH_CHARS_REGEX);
  if (matches && matches.length > 0) {
    const unique = [...new Set(matches)].join("");
    return `Contains illegal characters: ${unique}`;
  }

  return null;
}

/**
 * Ported from `ValidStandardTrackFormatValidator.IsValid`: must contain both
 * a Book Title token AND a PartNumber/PartCount token, OR an
 * `{Original Title}`/`{Original Filename}` token.
 */
export function validateStandardBookFormat(value: string): string | null {
  const hasBookTitleAndPart =
    new RegExp(BOOK_TITLE_REGEX).test(value) && new RegExp(PART_REGEX).test(value);
  const hasOriginalToken = new RegExp(ORIGINAL_TOKEN_REGEX).test(value);

  if (hasBookTitleAndPart || hasOriginalToken) {
    return null;
  }

  return "Must contain Book Title AND PartNumber, OR Original Title";
}

/** Ported from `FileNameValidation.ValidBookFormat` (NotEmpty + IllegalCharacters + ValidStandardTrackFormatValidator, in order -- first failure wins, matching FluentValidation's default cascade). */
export function validateBookFormat(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return "must not be empty";
  }

  return validateIllegalCharacters(value) ?? validateStandardBookFormat(value);
}

/** Ported from `RegularExpressionValidator(FileNameBuilder.AuthorNameRegex)`'s message: "Must contain Author name". */
export function validateAuthorFolderFormat(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return "must not be empty";
  }

  const illegal = validateIllegalCharacters(value);
  if (illegal) {
    return illegal;
  }

  if (!new RegExp(AUTHOR_NAME_REGEX).test(value)) {
    return "Must contain Author name";
  }

  return null;
}
