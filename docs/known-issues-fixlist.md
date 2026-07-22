# Known issues from Readarr / Chaptarr / bookshelf

Real, verified complaints pulled from GitHub's issue search API against Readarr
(archived), pennydreadful/bookshelf (the stalled open fork), and community
threads about Chaptarr (closed-source, no public tracker). Used to make sure
Pagarr's design and implementation actually address the problems that killed
or hobbled every prior attempt at this category, not just replicate them in
a new language.

## 1. Single-point-of-failure metadata server (the #1 structural complaint)

**Readarr #2783** (12R/27C, labels: Confirmed, Investigating) — "Metadata
Server Issues (429) & Authors with missing books / Authors not found."
**Readarr #4107** (13R/5C) — "Unable to reach api.bookinfo.club... 522."
**Readarr #3486** (6R/5C) — "Migrate to OpenLibrary as Metadata Backend."

Readarr depended on one centralized metadata server. When it rate-limited or
went down, authors that genuinely existed showed as "not found" -- not a
matching bug, an architectural single point of failure.

**Status: solved by design.** Pagarr queries three independent providers
(Hardcover, OpenLibrary, Google Books) with a priority/fallback chain and a
7-day cache (`metadata/cache.ts`). No single provider outage can produce a
false "not found." This is the reason SPEC.md #2 specifies multiple sources
rather than one -- confirmed correct by this research, not just prior intuition.

## 2. qBittorrent 5.2.0+ auth breaks on empty 204 response

**bookshelf #158** (8R/26C, the single highest-engagement open item in the
whole fork) — qBittorrent 5.2.0 changed `POST /api/v2/auth/login` to return
`204 No Content` on success instead of `200` + body `"Ok."`. The Servarr-family
auth check compares response body text against the literal string `"Ok."`,
so an empty 204 body is misread as a failure, and the client shows as
permanently unauthenticated against any 5.2.0+ qBittorrent instance.

**Status: not applicable.** `download-clients/qbittorrent.ts` checks `res.ok`
(true for both 200 and 204) and extracts the session ID from the `Set-Cookie`
header directly -- it never compares response body text, so this class of bug
doesn't exist in Pagarr's client. Documented inline in the source so a future
contributor doesn't "fix" something that was never broken.

## 3. Import gets stuck or crashes on ambiguous/multi-format downloads

**Readarr #1707** (0R/6C) — "Sometimes stuck on Downloaded-Importing when
importing torrent with multiple formats."
**Readarr #3131** (2R/4C) — `System.NullReferenceException` during import.
**Readarr #1620** (0R/3C) — "Failed to import book. SourceTitle = [null]."
**Readarr #2374** (0R/2C) — "Couldn't import book - Index was outside the
bounds of the array."
**Readarr #1124** (0R/4C) — EPUB and KEPUB files in the same release confuse
import matching.

Same root cause across all five: when the downloaded file(s) don't cleanly
match what the import step expected (multiple formats in one release, an
edition mismatch, an unexpected filename), Readarr crashes or hangs instead
of degrading gracefully.

**Status: design exists, implementation pending (task #10, import pipeline).**
`match_review_queue` in the schema and the `resolveMatch()` discipline in
`matching/resolve.ts` (never auto-accept an ambiguous match, land it in
review instead of guessing or crashing) is exactly the right shape for this
-- the import pipeline must route "can't confidently identify this file"
through that queue, never throw an unhandled exception. When multiple
formats exist in one release, score/select per the user's quality profile
rather than failing outright.

## 4. Manual-import edition selection doesn't stick

**Readarr #2472** (5R/4C) — "Manual Import - Select Edition Option Not
Saving."
**bookshelf #96** (4R/3C) — "Manually editted edition for a book but rename
always uses old edition."

When a user manually overrides which edition a file belongs to, the choice
is silently discarded and the (wrong) auto-detected edition is used for
naming/organizing instead.

**Status: relevant to task #10.** `import_history.matched_by` already has a
`'manual'` value in the schema for exactly this case -- the import/rename
step must treat a manual override as authoritative and never re-run
auto-detection over it.

## 5. Filesystem permission friction

Community sentiment on the Chaptarr Reddit PSA thread: "Constant Permission
issues - felt like I had to chown every folder it touched regardless if I
added to..." Recurring complaint in the *arr family generally (matches
bookshelf #49, "Root folder not writable by user 'abc'?").

**Status: relevant to task #10 (mover.ts) and Docker packaging.** Write
using the container's declared PUID/PGID convention (the linuxserver.io
standard the target audience already expects), and fail the import with a
clear, specific error message naming the exact path and permission problem
-- not a generic filesystem exception -- when a write fails.

## 6. Search "succeeds" but silently returns nothing usable

**bookshelf #59** (6R/11C) — "Searches fail for books that definitely exist
in Goodreads."
**bookshelf #92** (4R/13C) — "Search is Successful, but fails to add any
items."

The search UI reports success but the result set is empty or nothing gets
added, with no visible reason why.

**Status: relevant to tasks #10 and #13.** Every "no results" or "0 items
added" path in the API/UI must surface a specific reason (no matching
metadata found / all releases below quality cutoff / all candidates in
review queue) rather than a bare empty state -- this is a UX discipline to
carry into the routes and dashboard work, not a matching-logic problem.

## Not relevant / out of scope

- **Readarr #848** (239R, by far the highest-reaction issue found) — Libgen.io
  integration. Direct-scraping a specific site contradicts SPEC.md's
  non-goal of "always through Prowlarr, never direct indexer scraping" --
  intentionally not pursued.
- Feature requests with no bearing on core reliability (comics support,
  OPDS server, IRC ebook channels, tagging, narrator filename tokens) --
  legitimate asks, but out of v1 scope per SPEC.md and not "unfixed bugs,"
  just unbuilt features.
- ArrDash (a different, unrelated *arr dashboard project) surfaced in the
  research as noise from an imprecise search; not part of this category.
