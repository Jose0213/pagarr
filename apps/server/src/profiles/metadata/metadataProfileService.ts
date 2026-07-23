import type { TermMatcherService } from "../releases/termMatcherService.js";
import { MetadataProfileInUseException } from "../errors.js";
import { newMetadataProfile, type MetadataProfile } from "./metadataProfile.js";
import type { MetadataProfileRepository } from "./metadataProfileRepository.js";
import {
  popularity,
  BookAddType,
  type AuthorSeries,
  type FilterBook,
  type FilterEdition,
  type LocalBook,
  type LocalBookFile,
} from "./bookFiltering.js";

/**
 * Ported from NzbDrone.Core/Profiles/Metadata/MetadataProfileService.cs.
 *
 * See bookFiltering.ts's doc comment for why Book/Edition/Author/
 * SeriesBookLink/BookFile are narrowed local interfaces rather than the
 * real Books-module types (Books hasn't been ported yet). Collaborators
 * (IAuthorService, IBookService, IEditionService, IMediaFileService,
 * IImportListFactory, IRootFolderService) are likewise narrowed to the
 * exact read-only surface this service calls, injected via the
 * constructor's `deps` param, and default to "nothing registered" --
 * matching qualityProfileService.ts's identical pattern.
 *
 * `canonicalizeLanguage` (C#: `string.CanonicalizeLanguage()`, an ISO-639
 * two/three-letter-code + full-name normalizer with large lookup tables
 * defined in NzbDrone.Core/Books/Calibre/Extensions.cs) is injected as a
 * plain function rather than reimplemented here: that lookup table is
 * Books/Calibre domain data, not Profiles domain logic, and duplicating a
 * large ISO-639 table inside this module would risk drifting from the
 * canonical one when Books lands. Defaults to a pass-through
 * lowercase+trim so allowedLanguages filtering degrades to exact
 * case-insensitive string matching until the real implementation is wired
 * in -- degraded matching, not broken matching.
 */
export interface AuthorLookup {
  /** Ported from IAuthorService.FindById(string foreignAuthorId). */
  findById(foreignAuthorId: string): { id: number; authorMetadataId: number } | undefined;
  /** Ported from IAuthorService.GetAllAuthors(), used by Delete()'s in-use check. */
  getAllAuthors(): { metadataProfileId: number }[];
}

export interface BookLookup {
  /** Ported from IBookService.GetBooksByAuthorMetadataId(int authorMetadataId). */
  getBooksByAuthorMetadataId(authorMetadataId: number): LocalBook[];
}

export interface EditionLookup {
  /** Ported from IEditionService.GetEditionsByAuthor(int authorId), grouped by BookId in the C# caller. */
  getEditionsByAuthor(authorId: number): { bookForeignBookId: string; edition: LocalBook["editions"][number] }[];
}

export interface MediaFileLookup {
  /** Ported from IMediaFileService.GetFilesByAuthor(int authorId). */
  getFilesByAuthor(authorId: number): LocalBookFile[];
}

export interface ImportListProfileUsageLookup {
  all(): { metadataProfileId: number }[];
}

export interface RootFolderProfileUsageLookup {
  all(): { defaultMetadataProfileId: number }[];
}

const noAuthors: AuthorLookup = { findById: () => undefined, getAllAuthors: () => [] };
const noBooks: BookLookup = { getBooksByAuthorMetadataId: () => [] };
const noEditions: EditionLookup = { getEditionsByAuthor: () => [] };
const noMediaFiles: MediaFileLookup = { getFilesByAuthor: () => [] };
const noImportLists: ImportListProfileUsageLookup = { all: () => [] };
const noRootFolders: RootFolderProfileUsageLookup = { all: () => [] };

function defaultCanonicalizeLanguage(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === "") {
    return null;
  }
  return raw.toLowerCase().trim();
}

export interface MetadataProfileServiceDeps {
  authorService?: AuthorLookup;
  bookService?: BookLookup;
  editionService?: EditionLookup;
  mediaFileService?: MediaFileLookup;
  importListFactory?: ImportListProfileUsageLookup;
  rootFolderService?: RootFolderProfileUsageLookup;
  termMatcherService?: TermMatcherService;
  canonicalizeLanguage?: (raw: string | null | undefined) => string | null;
}

/** Ported from MetadataProfileService's NONE_PROFILE_NAME/NONE_PROFILE_MIN_POPULARITY constants. */
export const NONE_PROFILE_NAME = "None";
export const NONE_PROFILE_MIN_POPULARITY = 1e10;

/**
 * Ported from MetadataProfileService's `PartOrSetRegex`. .NET allows the
 * same named group (`from`/`to`) to repeat across disjoint alternation
 * branches; JS's `RegExp` did not until a recent V8/engine change (duplicate
 * named capture groups), which isn't available on the Node version this
 * project's CI pins to (see PORT_PLAN.md's node:sqlite version-boundary
 * note for the same class of gotcha) -- `/(?<from>\d+) of (?<to>\d+)|(?<from>\d+).../`
 * throws `SyntaxError: Duplicate capture group name` there. Ported as three
 * separate single-alternative regexes instead of one three-way alternation,
 * tried in the same order the original's alternation would have matched
 * them, preserving identical match semantics without relying on duplicate
 * group name support.
 */
const PART_OR_SET_REGEXES = [
  /(?<from>\d+) of (?<to>\d+)/i,
  /(?<from>\d+)\s?\/\s?(?<to>\d+)/i,
  /(?<from>\d+)\s?-\s?(?<to>\d+)/i,
];

function matchPartOrSet(title: string): RegExpExecArray | null {
  for (const regex of PART_OR_SET_REGEXES) {
    const match = regex.exec(title);
    if (match) {
      return match;
    }
  }
  return null;
}

export class MetadataProfileService {
  private readonly authorService: AuthorLookup;
  private readonly bookService: BookLookup;
  private readonly editionService: EditionLookup;
  private readonly mediaFileService: MediaFileLookup;
  private readonly importListFactory: ImportListProfileUsageLookup;
  private readonly rootFolderService: RootFolderProfileUsageLookup;
  private readonly termMatcherService: TermMatcherService | undefined;
  private readonly canonicalizeLanguage: (raw: string | null | undefined) => string | null;

  constructor(
    private readonly profileRepository: MetadataProfileRepository,
    deps: MetadataProfileServiceDeps = {}
  ) {
    this.authorService = deps.authorService ?? noAuthors;
    this.bookService = deps.bookService ?? noBooks;
    this.editionService = deps.editionService ?? noEditions;
    this.mediaFileService = deps.mediaFileService ?? noMediaFiles;
    this.importListFactory = deps.importListFactory ?? noImportLists;
    this.rootFolderService = deps.rootFolderService ?? noRootFolders;
    this.termMatcherService = deps.termMatcherService;
    this.canonicalizeLanguage = deps.canonicalizeLanguage ?? defaultCanonicalizeLanguage;
  }

  add(profile: MetadataProfile): MetadataProfile {
    return this.profileRepository.insert(profile);
  }

  /** Ported from MetadataProfileService.Update(): the None profile can never be edited. */
  update(profile: MetadataProfile): void {
    if (profile.name === NONE_PROFILE_NAME) {
      throw new Error("Not permitted to alter None metadata profile");
    }

    this.profileRepository.update(profile);
  }

  /** Ported from MetadataProfileService.Delete(): the None profile and any in-use profile can never be deleted. */
  delete(id: number): void {
    const profile = this.profileRepository.get(id);

    const inUse =
      profile.name === NONE_PROFILE_NAME ||
      this.authorService.getAllAuthors().some((a) => a.metadataProfileId === id) ||
      this.importListFactory.all().some((l) => l.metadataProfileId === id) ||
      this.rootFolderService.all().some((r) => r.defaultMetadataProfileId === id);

    if (inUse) {
      throw new MetadataProfileInUseException(profile.name);
    }

    this.profileRepository.delete(id);
  }

  all(): MetadataProfile[] {
    return this.profileRepository.all();
  }

  get(id: number): MetadataProfile {
    return this.profileRepository.get(id);
  }

  exists(id: number): boolean {
    return this.profileRepository.exists(id);
  }

  /**
   * Ported from MetadataProfileService.FilterBooks(Author input, int
   * profileId): the public overload that resolves an incoming (remote,
   * e.g. from a metadata-provider lookup) Author's Series/local-DB
   * counterpart before delegating to the private FilterBooks(...) core
   * filter.
   */
  filterBooks(
    input: {
      foreignAuthorId: string;
      series: AuthorSeries[];
      books: FilterBook[];
    },
    profileId: number
  ): FilterBook[] {
    const seriesLinks = new Map<FilterBook, { position: string | null; isPrimary: boolean }[]>();
    for (const series of input.series) {
      for (const link of series.linkItems) {
        const existing = seriesLinks.get(link.book) ?? [];
        existing.push({ position: link.position, isPrimary: link.isPrimary });
        seriesLinks.set(link.book, existing);
      }
    }

    const dbAuthor = this.authorService.findById(input.foreignAuthorId);

    let localBooks: LocalBook[] = [];
    if (dbAuthor) {
      localBooks = this.bookService.getBooksByAuthorMetadataId(dbAuthor.authorMetadataId);
      const editionsByBook = new Map<string, LocalBook["editions"]>();
      for (const { bookForeignBookId, edition } of this.editionService.getEditionsByAuthor(dbAuthor.id)) {
        const existing = editionsByBook.get(bookForeignBookId) ?? [];
        existing.push(edition);
        editionsByBook.set(bookForeignBookId, existing);
      }

      for (const book of localBooks) {
        book.editions = editionsByBook.get(book.foreignBookId) ?? [];
      }
    }

    const localFiles = this.mediaFileService.getFilesByAuthor(dbAuthor?.id ?? 0);

    return this.filterBooksCore(input.books, localBooks, localFiles, seriesLinks, profileId);
  }

  /** Ported from MetadataProfileService's private FilterBooks(...) core filter. */
  private filterBooksCore(
    remoteBooks: FilterBook[],
    localBooks: LocalBook[],
    localFiles: LocalBookFile[],
    seriesLinks: Map<FilterBook, { position: string | null; isPrimary: boolean }[]>,
    metadataProfileId: number
  ): FilterBook[] {
    const profile = this.get(metadataProfileId);

    const remaining = new Set(remoteBooks);
    const titles = new Set(remoteBooks.map((x) => x.title));

    const localHash = new Set(
      localBooks.filter((x) => x.addType === BookAddType.Manual).map((x) => x.foreignBookId)
    );
    for (const file of localFiles) {
      localHash.add(file.bookForeignBookId);
    }

    this.filterByPredicate(
      remaining,
      (x) => x.foreignBookId,
      localHash,
      profile,
      (x, p) => this.bookAllowedByRating(x, p)
    );
    this.filterByPredicate(
      remaining,
      (x) => x.foreignBookId,
      localHash,
      profile,
      (x, p) => !p.skipMissingDate || x.releaseDate != null
    );
    this.filterByPredicate(
      remaining,
      (x) => x.foreignBookId,
      localHash,
      profile,
      (x, p) => !p.skipPartsAndSets || !this.isPartOrSet(x, seriesLinks.get(x), titles)
    );
    this.filterByPredicate(
      remaining,
      (x) => x.foreignBookId,
      localHash,
      profile,
      (x, p) => {
        const links = seriesLinks.get(x);
        return !p.skipSeriesSecondary || !links || links.some((y) => y.isPrimary);
      }
    );
    this.filterByPredicate(
      remaining,
      (x) => x.foreignBookId,
      localHash,
      profile,
      (x, p) => !p.ignored.some((i) => this.matchesTerms(x.title, i))
    );

    for (const book of remaining) {
      const localEditions =
        localBooks.find((x) => x.foreignBookId === book.foreignBookId)?.editions ?? [];
      book.editions = this.filterEditions(book.editions, localEditions, localFiles, profile);
    }

    this.filterByPredicate(
      remaining,
      (x) => x.foreignBookId,
      localHash,
      profile,
      (x, p) => x.editions.some((e) => e.pageCount > p.minPages) || x.editions.every((e) => e.pageCount === 0)
    );
    this.filterByPredicate(
      remaining,
      (x) => x.foreignBookId,
      localHash,
      profile,
      (x) => x.editions.length > 0
    );

    return Array.from(remaining);
  }

  /** Ported from MetadataProfileService's private FilterEditions(...). */
  private filterEditions(
    editions: FilterEdition[],
    localEditions: LocalBook["editions"],
    localFiles: LocalBookFile[],
    profile: MetadataProfile
  ): FilterEdition[] {
    const allowedLanguages = new Set(
      profile.allowedLanguages && profile.allowedLanguages.trim() !== ""
        ? profile.allowedLanguages
            .replace(/^,+|,+$/g, "")
            .split(",")
            .map((x) => this.canonicalizeLanguage(x))
        : []
    );

    const remaining = new Set(editions);

    const localHash = new Set(
      localEditions.filter((x) => x.manualAdd).map((x) => x.foreignEditionId)
    );
    for (const file of localFiles) {
      localHash.add(file.editionForeignEditionId);
    }

    this.filterByPredicate(
      remaining,
      (x) => x.foreignEditionId,
      localHash,
      profile,
      (x) => allowedLanguages.size === 0 || allowedLanguages.has(this.canonicalizeLanguage(x.language))
    );
    this.filterByPredicate(
      remaining,
      (x) => x.foreignEditionId,
      localHash,
      profile,
      (x, p) =>
        !p.skipMissingIsbn ||
        (x.isbn13 != null && x.isbn13.trim() !== "") ||
        (x.asin != null && x.asin.trim() !== "")
    );
    this.filterByPredicate(
      remaining,
      (x) => x.foreignEditionId,
      localHash,
      profile,
      (x, p) => !p.ignored.some((i) => this.matchesTerms(x.title, i))
    );

    return Array.from(remaining);
  }

  /**
   * Ported from MetadataProfileService's private generic FilterByPredicate<T>:
   * removes every item from `remaining` that (a) fails `allowed` AND (b) is
   * not already present locally (`localItems`) -- local items are always
   * kept regardless of the remote filter criteria, matching the C# "don't
   * un-monitor/hide things the user already has" behavior.
   */
  private filterByPredicate<T>(
    remaining: Set<T>,
    getId: (item: T) => string,
    localItems: Set<string>,
    profile: MetadataProfile,
    allowed: (item: T, profile: MetadataProfile) => boolean
  ): void {
    const toRemove = Array.from(remaining).filter(
      (x) => !allowed(x, profile) && !localItems.has(getId(x))
    );
    for (const item of toRemove) {
      remaining.delete(item);
    }
  }

  /** Ported from MetadataProfileService.BookAllowedByRating(Book, MetadataProfile). */
  private bookAllowedByRating(book: FilterBook, profile: MetadataProfile): boolean {
    // hack for the 'none' metadata profile
    if (profile.minPopularity === NONE_PROFILE_MIN_POPULARITY) {
      return false;
    }

    return (
      popularity(book.ratings) >= profile.minPopularity ||
      (book.releaseDate != null && book.releaseDate.getTime() > Date.now())
    );
  }

  /** Ported from MetadataProfileService.IsPartOrSet(Book, List<SeriesBookLink>, HashSet<string>). */
  private isPartOrSet(
    book: FilterBook,
    seriesLinks: { position: string | null; isPrimary: boolean }[] | undefined,
    titles: Set<string>
  ): boolean {
    if (
      seriesLinks != null &&
      seriesLinks.some((x) => x.position != null && x.position.trim() !== "") &&
      !seriesLinks.some((s) => s.position != null && isParseableDouble(s.position))
    ) {
      // No non-empty series entries parse to a number, so all like 1-3 etc.
      return true;
    }

    // Skip things of form Title1 / Title2 when Title1 and Title2 are already in the list
    const bookTitles = [book.title, ...book.editions.map((x) => x.title)];
    for (const title of bookTitles) {
      const split = title.split("/").map((x) => x.trim());
      if (split.length > 1 && split.every((x) => titles.has(x))) {
        return true;
      }
    }

    const match = matchPartOrSet(book.title);

    if (match?.groups?.["from"]) {
      const from = Number.parseInt(match.groups["from"], 10);
      return from <= 1800 || from > new Date().getUTCFullYear();
    }

    return false;
  }

  /** Ported from MetadataProfileService.MatchesTerms(string value, string terms). */
  private matchesTerms(value: string, terms: string): boolean {
    if (terms.trim() === "" || value.trim() === "") {
      return false;
    }

    const split = terms.split(",").filter((t) => t !== "");
    return this.containsAny(split, value).length > 0;
  }

  /** Ported from MetadataProfileService.ContainsAny(List<string>, string). */
  private containsAny(terms: string[], title: string): string[] {
    if (!this.termMatcherService) {
      return [];
    }
    return terms.filter((t) => this.termMatcherService!.isMatch(t, title));
  }

  /**
   * Ported from MetadataProfileService.Handle(ApplicationStartedEvent):
   * seeds the "Standard" default metadata profile and the fixed "None"
   * profile on first start, and defends against a non-empty profile
   * somehow already using the reserved "None" name by renaming it out of
   * the way first.
   */
  handleApplicationStarted(): void {
    const profiles = this.all();

    // Name is a unique property
    const emptyProfile = profiles.find((x) => x.name === NONE_PROFILE_NAME);

    // make sure empty profile exists and is actually empty
    if (emptyProfile != null && emptyProfile.minPopularity === NONE_PROFILE_MIN_POPULARITY) {
      return;
    }

    if (profiles.length === 0) {
      this.add(
        newMetadataProfile({
          name: "Standard",
          minPopularity: 350,
          skipMissingDate: true,
          skipPartsAndSets: true,
          allowedLanguages: "eng, null",
        })
      );
    }

    if (emptyProfile != null) {
      // emptyProfile is not the correct empty profile - move it out of the way
      //
      // KNOWN BUG, ported faithfully (see task brief: "Known bugs get fixed
      // later, separately. Do not redesign."): the real C# source's retry
      // loop increments `i` but never recomputes `emptyProfile.Name` inside
      // the loop body, so if "None.1" is already taken this is a genuine
      // infinite loop in Readarr today (`while (names.Contains(...)) { i++; }`
      // with no reassignment of the string being checked). Reproduced here
      // exactly, including the hang, rather than silently fixing it -- a
      // human should decide the fix (most likely: move `emptyProfile.Name =
      // ...` inside the loop) as a separate, tracked change.
      const names = new Set(profiles.map((x) => x.name));

      let i = 1;
      emptyProfile.name = `${NONE_PROFILE_NAME}.${i}`;

      while (names.has(emptyProfile.name)) {
        i++;
      }

      this.profileRepository.update(emptyProfile);
    }

    this.add(
      newMetadataProfile({
        name: NONE_PROFILE_NAME,
        minPopularity: NONE_PROFILE_MIN_POPULARITY,
      })
    );
  }
}

/**
 * Ported equivalent of .NET's `double.TryParse(s, out _)` as used by
 * IsPartOrSet's series-position check. JS's `Number.parseFloat` is looser
 * than .NET's TryParse (e.g. `parseFloat("12abc")` succeeds at 12, where
 * .NET's TryParse rejects the whole string as invalid), so this requires
 * the *entire* trimmed string to be numeric, matching TryParse's
 * whole-string semantics. Accepts the same shapes .NET's invariant double
 * parsing does: optional sign, digits, optional decimal point + digits,
 * optional exponent.
 */
function isParseableDouble(value: string): boolean {
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value.trim());
}
