# Pagarr

[![Build](https://img.shields.io/github/actions/workflow/status/Jose0213/pagarr/ci.yml?branch=main)](https://github.com/Jose0213/pagarr/actions)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Discussions](https://img.shields.io/badge/discussions-GitHub-blue)](https://github.com/Jose0213/pagarr/discussions)

Pagarr automates book and audiobook collection management for Usenet and
BitTorrent users, integrating with your favorite indexers and download
clients. It's a TypeScript rewrite of [Readarr](https://github.com/Readarr/Readarr),
continuing book/audiobook automation for the *arr ecosystem after Readarr's
archival.

## Status

Early. The foundation (data layer, HTTP client, configuration) and core
domain model (books/authors, quality definitions, profiles, languages,
tags, root folders) are ported, module by module, from Readarr's original
C#/.NET source -- see [PORT_PLAN.md](./PORT_PLAN.md) for the full sequence
and what's landed so far. No API or UI wired up yet -- not ready for daily
use.

Pagarr is a faithful port, not a from-scratch rewrite: it follows Readarr's
actual architecture, data model, and behavior, with known bugs fixed on top
once each module lands. See
[docs/known-issues-fixlist.md](./docs/known-issues-fixlist.md) for the
real, verified issue list this project works through.

## Getting Started

- Installation -- coming once a first buildable release exists
- [Architecture & port plan](./PORT_PLAN.md)
- [Known issues being fixed](./docs/known-issues-fixlist.md)

## Support

- [GitHub Discussions](https://github.com/Jose0213/pagarr/discussions)
- [GitHub Issues](https://github.com/Jose0213/pagarr/issues)

## Features

Ported from Readarr, module by module:

- Author/book monitoring and automatic search via indexer aggregators (Prowlarr)
- Download client integration (qBittorrent, SABnzbd)
- Quality profiles and automatic upgrades
- Metadata-driven library organization and renaming
- A web UI matching the rest of the *arr family

## Contributing

Pagarr is ported one module at a time, faithfully translating Readarr's
C#/.NET source to TypeScript before patching known issues. See
[PORT_PLAN.md](./PORT_PLAN.md) for the module sequence, stack decisions, and
how a module goes from "ported" to "merged."

### Development

TypeScript, Node 22+, `pnpm`. Once a module lands:

```bash
pnpm install
pnpm --filter @pagarr/server typecheck
pnpm --filter @pagarr/server test
pnpm --filter @pagarr/server build
```

## License

GPL-3.0, matching Readarr's own license -- this is a derivative work of
Readarr's source, ported with attribution. See [LICENSE](./LICENSE).
