/**
 * Ported from NzbDrone.Core/Organizer/FileNameBuilderTokenEqualityComparer.cs.
 *
 * C# used this as a custom `IEqualityComparer<string>` for a
 * `Dictionary<string, Func<TokenMatch, string>>`, so that token keys like
 * `"{Author Name}"`, `"{Author_Name}"`, and `"{AUTHOR-NAME}"` all hash/compare
 * equal (whitespace/underscore/any-non-word character stripped, lowercased)
 * -- letting `AddAuthorTokens` register a single canonical `"{Author Name}"`
 * entry while `ReplaceToken` looks up whatever separator/casing variant
 * actually appeared in the user's naming pattern.
 *
 * TypeScript's `Map` doesn't support a custom key-equality function the way
 * C#'s `Dictionary<TKey,TValue>` constructor does, so this ports the same
 * behavior as a `Map<string, V>` subclass that normalizes every key (via
 * `simplifyToken`, below) before delegating to the underlying `Map` --
 * functionally identical lookup/set/has/get behavior, since two
 * differently-cased/spaced token strings simply collapse to the same
 * underlying storage key instead of comparing equal via a custom comparer.
 */

const SIMPLE_TOKEN_REGEX = /\s|_|\W/gi;

/** Ported from `FileNameBuilderTokenEqualityComparer.SimplifyToken`. */
export function simplifyToken(token: string): string {
  return token.replace(SIMPLE_TOKEN_REGEX, "").toLowerCase();
}

export class TokenMap<V> extends Map<string, V> {
  override set(key: string, value: V): this {
    return super.set(simplifyToken(key), value);
  }

  override get(key: string): V | undefined {
    return super.get(simplifyToken(key));
  }

  override has(key: string): boolean {
    return super.has(simplifyToken(key));
  }

  /** Ported from Dictionary<>.GetValueOrDefault(key, defaultValue) as used by ReplaceToken/ReplacePartToken. */
  getOrDefault(key: string, defaultValue: V): V {
    const found = this.get(key);
    return found === undefined ? defaultValue : found;
  }
}
