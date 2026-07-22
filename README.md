# Pagarr

A faithful TypeScript/Node port of [Readarr](https://github.com/Readarr/Readarr)
(archived 2025), books/audiobooks automation for the *arr ecosystem
(Sonarr, Radarr, Prowlarr).

Readarr's C#/.NET codebase became unmaintainable and the project was
archived. The one open fork (pennydreadful/bookshelf) has been stalled
since February 2026. This is a real port -- not a rewrite from scratch --
of Readarr's actual architecture and behavior to TypeScript, module by
module, with known bugs fixed on top once each module lands.

See [PORT_PLAN.md](./PORT_PLAN.md) for the module-by-module port sequence
and architecture decisions, and
[docs/known-issues-fixlist.md](./docs/known-issues-fixlist.md) for the
real, verified bug list this project fixes as it goes.

Status: early -- foundation (data layer, config, HTTP client) in progress.

## Stack

TypeScript, Node 22+, Fastify, `node:sqlite`, React frontend (Readarr's
frontend was already React/JS -- ported to TypeScript incrementally).

## License

GPL-3.0, matching Readarr's own license -- this is a derivative work of
Readarr's source, ported with attribution.
