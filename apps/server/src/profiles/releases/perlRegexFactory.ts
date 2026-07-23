/**
 * Ported from NzbDrone.Core/Profiles/Releases/PerlRegexFactory.cs.
 *
 * Parses a `/pattern/modifiers` perl-style regex literal (used throughout
 * Readarr's Required/Ignored release-profile term lists to opt into regex
 * matching instead of plain substring matching -- see termMatcherService.ts).
 *
 * DEVIATION -- modifier support: .NET's RegexOptions has no JS RegExp
 * equivalent for two of the five modifiers the C# switch accepts:
 *   - `s` (Singleline: `.` also matches `\n`) -> JS `s` flag. Direct match.
 *   - `m` (Multiline: `^`/`$` match line boundaries) -> JS `m` flag. Direct match.
 *   - `i` (IgnoreCase) -> JS `i` flag. Direct match.
 *   - `x` (IgnorePatternWhitespace: whitespace/`#`-comments in the pattern
 *     are ignored) -> no JS engine support at all (proposed but not
 *     shipped). There is no way to reproduce this without a custom
 *     pattern-preprocessor that would risk diverging from .NET's exact
 *     whitespace/comment-stripping grammar for edge cases (escaped
 *     whitespace, whitespace inside character classes, etc). Deferred:
 *     throws the same "unsupported" error the C# switch's `default` case
 *     throws for any modifier it doesn't recognize, rather than silently
 *     dropping the flag and changing matching behavior.
 *   - `n` (ExplicitCapture: unnamed groups stop capturing) -> no JS RegExp
 *     flag exists for this either (capture-group behavior isn't
 *     user-toggleable in JS). Same treatment: unsupported, throws.
 * Both are called out explicitly here (rather than silently ignored) so a
 * user-supplied `/foo/x` or `/foo/n` term fails loudly at profile-save/
 * matcher-creation time instead of silently matching differently than
 * Readarr proper would.
 */
const PERL_REGEX_FORMAT = /^\/(?<pattern>.*)\/(?<modifiers>[a-z]*)$/;

export function tryCreateRegex(pattern: string): RegExp | null {
  const match = PERL_REGEX_FORMAT.exec(pattern);

  if (!match?.groups) {
    return null;
  }

  return createRegex(match.groups["pattern"] ?? "", match.groups["modifiers"] ?? "");
}

export function createRegex(pattern: string, modifiers: string): RegExp {
  const flags = getFlags(modifiers);

  // For now we simply expect the pattern to be JS-regex compliant. We
  // should probably check and reject .NET-specific constructs (ported
  // comment from the C# source, which made the equivalent perl-specific
  // caveat about its own target regex flavor).
  return new RegExp(pattern, flags);
}

function getFlags(modifiers: string): string {
  let flags = "";

  for (const modifier of modifiers) {
    switch (modifier) {
      case "m":
        flags += "m";
        break;

      case "s":
        flags += "s";
        break;

      case "i":
        flags += "i";
        break;

      case "x":
      case "n":
        throw new Error(`Unknown or unsupported perl regex modifier: ${modifier}`);

      default:
        throw new Error(`Unknown or unsupported perl regex modifier: ${modifier}`);
    }
  }

  return flags;
}
