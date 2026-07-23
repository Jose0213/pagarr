/**
 * Ported from NzbDrone.Core/MediaCover/MediaCover.cs.
 *
 * C#: `MediaCover : MemberwiseEquatable<MediaCover>, IEmbeddedDocument` --
 * `IEmbeddedDocument` (Datastore) just marks it as JSON-embeddable inside a
 * parent row (e.g. `AuthorMetadata.Images`), and `MemberwiseEquatable<T>`
 * (the `Equ` library) supplies structural `Equals`/`GetHashCode`. Neither
 * is ported: this module doesn't own a repository/column for `MediaCover`
 * itself (it's embedded inside `books/models.ts`'s `AuthorMetadata.images`/
 * `Edition.images`, both already ported as the narrower `MediaCoverImage`
 * shape -- see that file's doc comment on `MediaCoverImage`), and nothing
 * in this module's ported surface depends on object-identity equality
 * (matches this port's established "Equ-based memberwise equality isn't
 * ported" precedent, see `books/models.ts`'s module doc comment on
 * `Entity<T>`).
 *
 * `Url`'s setter auto-derives `Extension` from the URL's path the *first*
 * time it's set (`if (Extension.IsNullOrWhiteSpace()) Extension = Path.
 * GetExtension(value);` -- note this means Extension is "sticky": once set,
 * later Url re-assignments don't recompute it). Ported as a real getter/
 * setter pair over private backing fields to preserve that exact
 * stateful/sticky behavior (a plain data interface, like `MediaCoverImage`,
 * couldn't reproduce it -- this is one of the few places in this port that
 * needs a real class with behavior, not a plain interface, hence living in
 * its own file distinct from `books/models.ts`'s plain-interface
 * `MediaCoverImage`).
 */

export enum MediaCoverTypes {
  Unknown = 0,
  Poster = 1,
  Banner = 2,
  Fanart = 3,
  Screenshot = 4,
  Headshot = 5,
  Cover = 6,
  Disc = 7,
  Logo = 8,
  Clearlogo = 9,
}

export enum MediaCoverEntity {
  Author = 0,
  Book = 1,
}

/**
 * Ported from `Path.GetExtension(string path)`: returns the substring from
 * the last '.' in the last path segment onward (including the dot), or ""
 * if there is none. .NET's GetExtension operates on the raw string (it
 * doesn't know about URL query strings) -- ported the same literal way
 * rather than URL-parsing the value, matching the C# original's behavior
 * for URLs with query strings (the "extension" can end up including
 * `?query=part` if the last dot is inside the query string, exactly as
 * .NET's Path.GetExtension would produce on the same input).
 */
function getPathExtension(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const lastDot = path.lastIndexOf(".");

  if (lastDot <= lastSlash || lastDot === -1) {
    return "";
  }

  return path.slice(lastDot);
}

export class MediaCover {
  private _url = "";
  private _extension: string | null = null;

  coverType: MediaCoverTypes;
  remoteUrl: string | null = null;

  constructor(coverType: MediaCoverTypes = MediaCoverTypes.Unknown, url = "") {
    this.coverType = coverType;
    this.url = url;
  }

  get url(): string {
    return this._url;
  }

  /** Ported from the C# `Url` setter: assigning a new URL only (re)computes `Extension` the first time it's blank -- see class doc comment. */
  set url(value: string) {
    this._url = value;

    if (isNullOrWhiteSpace(this._extension)) {
      this._extension = getPathExtension(value);
    }
  }

  get extension(): string {
    return this._extension ?? "";
  }
}

function isNullOrWhiteSpace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}
