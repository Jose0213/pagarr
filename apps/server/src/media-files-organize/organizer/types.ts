/**
 * Ported from NzbDrone.Core/Organizer/AbsoluteBookFormat.cs +
 * NzbDrone.Core/Organizer/BookFormat.cs.
 *
 * Both are dead code in the real C# source: `AbsoluteBookFormat` has zero
 * references anywhere in NzbDrone.Core (grep confirms only its own
 * declaration), and `BookFormat` is only ever constructed by
 * `FileNameBuilder.GetTrackFormat` (itself only called from
 * `GetBasicNamingConfig`, which reads just `.Separator` off the *last*
 * result -- `.BookPattern`/`.BookSeparator` are written but never read by
 * anything). These are almost certainly TV-naming (Sonarr/Lidarr-lineage)
 * leftovers never fully adapted for books during Readarr's fork. Ported here
 * as plain data shapes for fidelity with the real source rather than
 * silently dropped -- per this port's "preserve actual behavior/structure,
 * don't tidy up" discipline -- but callers should not expect either type to
 * do anything meaningful.
 */
export interface AbsoluteBookFormat {
  separator: string;
  absoluteBookPattern: string;
}

export interface BookFormat {
  separator: string;
  bookPattern: string;
  bookSeparator: string;
}

/** Ported from NzbDrone.Core/Organizer/SampleResult.cs. */
export interface SampleResultAuthorLike {
  id: number;
}

export interface SampleResultBookLike {
  id: number;
}

export interface SampleResultBookFileLike {
  id: number;
}
