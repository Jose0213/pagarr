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
- `Indexers` (76 files) -- Prowlarr/Torznab client, indexer definitions
- `IndexerSearch` (10 files)
- `Parser` (20 files) -- release title parsing (this is the exact subsystem
  behind several known-issues findings -- port carefully, then patch)
- `DecisionEngine` (41 files) -- release acceptance/rejection logic
- `CustomFormats` (15 files)
- `MetadataSource` (42 files) -- Goodreads/metadata provider client (NOTE:
  Readarr's actual MetadataSource depended on its own centralized metadata
  server that's the root cause of known-issue #1 -- port the interface/shape,
  but the provider implementations get replaced with Hardcover/OpenLibrary/
  Google Books per the original clean-room research, not ported as-is)

### Phase 3 -- Download + import (parallel worktrees, depend on Phase 2)
- `Download` (223 files, largest module) -- download client abstraction
  (qBittorrent/SABnzbd), download tracking, completed-download handling
- `MediaFiles` (120 files) -- file import, renaming (`Organizer/`, 13 files,
  is the naming-template engine -- port this one precisely, it's directly
  reusable)
- `Extras` (30 files)
- `RemotePathMappings` (3 files)

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
