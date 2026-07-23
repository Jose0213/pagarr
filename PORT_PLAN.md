# Pagarr Port Plan

Full faithful port of Readarr (github.com/Readarr/Readarr, GPLv3) from C#/.NET
to TypeScript/Node, module by module, preserving its actual architecture and
domain logic rather than redesigning from scratch. Known bugs (see
docs/known-issues-fixlist.md from the prior clean-room build, still valid
research) get fixed on top once each module is faithfully ported and working.

Source reference: `C:\Users\zay\pagarr-port-src\readarr-source\` (cloned
2026-07-22, not tracked in this repo -- read-only reference material for
agents to port from).

## Stack decisions (locked, do not deviate per-module)

- **Backend runtime:** Node 22+, TypeScript, Fastify (as before).
- **Data layer:** `node:sqlite` + hand-written repository classes, one per
  C# repository in `NzbDrone.Core/Datastore` and each domain module's
  `*Repository.cs`. No ORM engine binary (ruled out Prisma/Drizzle to avoid
  native-compile/cross-platform risk -- see prior session's `better-sqlite3`
  gotcha on Windows/Node 24).
- **Migrations:** hand-written `.sql` files in `db/migrations/`, ported from
  Readarr's EF Core migration history (`NzbDrone.Core/Datastore/Migration/`)
  -- read the intent of each migration, don't try to replay EF's generated
  SQL verbatim.
- **Realtime (SignalR replacement):** Fastify's `@fastify/websocket`, ported
  from `NzbDrone.SignalR/`.
- **DI container replacement:** plain constructor injection / factory
  functions passed explicitly. Readarr's C# DI (`NzbDrone.Common` service
  registration) doesn't have a direct TS equivalent and doesn't need one --
  port the *behavior* of each service class, not the container.
- **Frontend:** React (already the case in Readarr's own frontend/ -- this is
  the one part of Readarr that's already close to a straight port, since it's
  already JS/React, not C#).

## Module port order (dependency-sequenced, file counts from NzbDrone.Core)

Work happens in git worktrees, one per module/module-group, so independent
modules port in parallel. Dependent modules wait for their prerequisites to
land on `port-main` after review.

### Phase 0 -- Foundation (built directly, not via agent/worktree)
Everything else depends on this existing first.
- Project scaffold (package.json, tsconfig, Fastify app shell)
- `Datastore` (92 files) -- db client, migration runner, base repository pattern
- `Configuration` (15 files) -- app config/settings storage
- `Http` (8 files) -- shared HTTP client wrapper (ported from `NzbDrone.Common.Http`)

### Phase 1 -- Core domain model (parallel worktrees, depend only on Phase 0)
- `Books` (80 files) -- author/book/edition/series entities + services
- `Qualities` (11 files) -- quality definitions
- `Profiles` (23 files) -- quality profiles, metadata profiles
- `Languages` (5 files)
- `Tags` (5 files)
- `RootFolders` (4 files)

### Phase 2 -- Acquisition pipeline (parallel worktrees, depend on Phase 1)

Worktrees staged 2026-07-22 at `~/pagarr-worktrees/{indexers,indexer-search,
parser,decision-engine,custom-formats,metadata-source}`, branches
`port/<module>` off `main` @ 8833b2c. Not yet dispatched to agents -- waiting
on Phase 1 (Books/Qualities/Profiles/Languages/Tags/RootFolders) to be
reviewed and merged first, since Phase 2 depends on Phase 1's domain model.

- `Indexers` (76 files, real `NzbDrone.Core/Indexers/` tree) -- port the
  generic protocol clients only: `Torznab/` (5 files) and `Newznab/` (8
  files), plus the shared base (`IndexerBase.cs`, `HttpIndexerBase.cs`,
  `IndexerDefinition.cs`, `IndexerFactory.cs`, `IndexerRepository.cs`,
  `IndexerStatus*`, `RssSyncService.cs`, request/response plumbing).
  **Explicitly out of scope:** the legacy per-site scrapers (`Gazelle/`,
  `IPTorrents/`, `Nyaa/`, `FileList/`, `Torrentleech/`, `TorrentRss/` -- ~26
  files total). Prowlarr already aggregates these trackers over Torznab;
  direct per-site scraping contradicts the locked non-goal in
  `docs/known-issues-fixlist.md` #6 ("always through Prowlarr, never direct
  indexer scraping" -- this is exactly what sank Readarr #848/Libgen). Only
  Torznab matters in practice since Prowlarr is the aggregator Pagarr talks
  to (confirmed live on Nova); Newznab is ported too since it's equally
  generic and cheap, for Usenet-only Prowlarr setups.
- `IndexerSearch` (10 files) -- author/book search commands + services that
  drive indexer queries.
- `Parser` (20 files) -- release title parsing (this is the exact subsystem
  behind several known-issues findings -- port carefully, then patch).
- `DecisionEngine` (41 files) -- release acceptance/rejection logic
  (`Specifications/` is the bulk of it -- each spec is a small, independently
  portable rejection rule).
- `CustomFormats` (15 files).
- `MetadataSource` (42 files) -- Readarr's real tree is `BookInfo/`,
  `Goodreads/`, `GoodreadsSearchProxy/` behind `IProvideAuthorInfo`/
  `IProvideBookInfo`/`IProvideSeriesInfo`/`ISearchForNew*` interfaces. Port
  the **interfaces/shape only** -- the provider implementations get replaced
  with Hardcover/OpenLibrary/Google Books per the original clean-room
  research (known-issues-fixlist.md #1: Readarr's single centralized
  metadata server, bookinfo.club, was the root cause of "authors not found"
  failures). Do not port Goodreads/BookInfo client code as-is; it's the thing
  being fixed, not faithfully preserved. Hardcover API reference:
  https://docs.hardcover.app/api/getting-started/

### Phase 3 -- Download + import (parallel worktrees, depend on Phase 2)

Given the size of `Download` (223 files) and `MediaFiles` (120 files), each
splits into sub-scoped worktrees rather than one worktree per top-level
module -- otherwise a single agent would be porting 3-5x the file count of
everyone else's Phase 3 work. Worktrees to stage once Phase 2 lands on
`main` (Download decisions need `DecisionEngine`; import needs `Parser`):

- `download-clients` -- `Download/Clients/{QBittorrent,Sabnzbd,Blackhole}/`
  (~38 files) + shared base (`DownloadClientBase.cs`, `TorrentClientBase.cs`,
  `UsenetClientBase.cs`, `IDownloadClient.cs`, `DownloadClientItem.cs`,
  `DownloadClientStatus*`, `DownloadClientRepository.cs`,
  `DownloadClientFactory.cs`, `DownloadClientDefinition.cs`,
  `DownloadClientProvider.cs`, `DownloadClientType.cs`, exceptions).
  **Explicitly out of scope** (same reasoning as Indexers' legacy scrapers):
  `Aria2/`, `Deluge/`, `DownloadStation/`, `Flood/`, `Hadouken/`,
  `NzbVortex/`, `Nzbget/`, `Pneumatic/`, `Transmission/`, `Vuze/`,
  `rTorrent/`, `uTorrent/` -- qBittorrent + SABnzbd are the two clients
  actually run (confirmed live on Nova); Blackhole (watch-folder based, no
  API) is cheap to port and is the natural fallback/manual-import path.
  Skipping ~11 other client integrations no one runs, matching this
  project's original clean-room task #9 scope.
- `download-tracking` -- `Download/{History,Pending,TrackedDownloads,
  Aggregation}/` + orchestration (`CompletedDownloadService.cs`,
  `DownloadService.cs`, `DownloadProcessingService.cs`,
  `FailedDownloadService.cs`, `IgnoredDownloadService.cs`,
  `NzbValidationService.cs`, `ProcessDownloadDecisions.cs`,
  `ProcessedDecisionResult.cs`, `ProcessedDecisions.cs`,
  `ProvideImportItemService.cs`, `RedownloadFailedDownloadService.cs`,
  events/commands) -- the queue/history/pending-release layer sitting on
  top of `download-clients`.
- `media-files-import` -- `MediaFiles/BookImport/` (38 files) +
  `DownloadedBooksImportService.cs`/`DownloadedBooksCommandService.cs` +
  `MediaFileService.cs`/`MediaFileRepository.cs`/`BookFile.cs` -- the actual
  import pipeline (this is the subsystem behind several known-issues
  findings on ambiguous/multi-format imports -- port carefully, then patch,
  same discipline as Parser).
- `media-files-tags` -- `MediaFiles/{EpubTag,AzwTag,TorrentInfo}/` (32
  files) + `AudioTagService.cs`/`EbookTagService.cs`/`MetadataTagService.cs`/
  `MediaInfoFormatter.cs` -- format-specific tag reading, needed by import
  to extract embedded book metadata.
- `media-files-organize` -- `Organizer/` (13 files -- NOT nested under
  MediaFiles despite the similar name; it's its own top-level
  `NzbDrone.Core/Organizer/` module) + `RenameBookFileService.cs`/
  `RenameBookFilePreview.cs`/`RetagBookFilePreview.cs`/
  `BookFileMovingService.cs`/`BookFileMoveResult.cs`/
  `UpgradeMediaFileService.cs`/`UpdateBookFileService.cs`/
  `MediaFileTableCleanupService.cs`/`RecycleBinProvider.cs`/
  `RootFolderWatchingService.cs`/`DiskScanService.cs` -- the naming-template
  engine and everything that acts on a filename once import has matched a
  file; port `Organizer/` precisely, it's directly reusable and load-bearing
  for known-issue #5 (filesystem permission friction).
- `extras` -- `Extras/` (30 files) -- cover art, metadata sidecar files,
  etc. accompanying an imported book.
- `remote-path-mappings` -- `RemotePathMappings/` (3 files) -- small, folded
  into whichever adjacent worktree has spare review bandwidth if 7 parallel
  agents is too many at once; otherwise its own worktree like every other
  module.

### Phase 4 -- Ops/UX layer (parallel worktrees, depend on Phase 0-3)
- `Notifications` (176 files, second-largest -- mostly N similar notifier
  implementations, highly parallelizable across sub-agents by notifier)
- `HealthCheck` (37 files)
- `Housekeeping` (36 files)
- `Messaging` (29 files) -- internal event bus
- `Validation` (26 files)
- `Update` (20 files) -- self-update mechanism (evaluate whether this is
  worth porting at all for a self-hosted single-container app; likely skip)
- `ThingiProvider` (18 files)
- `Instrumentation` (11 files) -- logging
- `Exceptions` (11 files)
- `Queue` (5 files)
- `Backup` (5 files)
- `Authentication` (5 files)
- `Jobs` (4 files)
- `Blocklisting` (4 files)
- `AuthorStats` (4 files)
- `ProgressMessaging` (3 files)
- `History` (3 files)
- `MediaCover` (6 files)
- `Lifecycle` (6 files)
- `Analytics` (evaluate -- likely skip, telemetry to Readarr's own servers
  which no longer exist)

### Phase 5 -- API + Frontend
- `Readarr.Api.V1` (155 files) -- REST endpoint layer over the ported core
- `frontend/` (985 JS/JSX files) -- already React; port to TS incrementally,
  wire against the new API

## Workflow (per module)

1. Agent gets a dedicated git worktree + branch (`port/<module-name>`).
2. Agent reads the real C# source for that module from the reference clone.
3. Agent ports it to TS under `apps/server/src/<module-name>/`, matching
   the C# module's actual class/behavior structure.
4. Agent writes/runs tests proving the port behaves like the original
   (unit tests where the C# had them, translated; new tests where needed).
5. Agent builds + typechecks + runs its own smoke test. Does NOT merge.
6. Agent reports back; Zay and Claude review the diff together.
7. Only after review does the branch get merged into `port-main`.

## Known-bug fixes (apply AFTER a module is ported and merged, not during)

See `docs/known-issues-fixlist.md` (carried over from the prior clean-room
build's research -- still valid, references real Readarr/bookshelf issues).
Applied as follow-up patches once the corresponding module is faithfully
ported and stable, not baked into the initial port.
