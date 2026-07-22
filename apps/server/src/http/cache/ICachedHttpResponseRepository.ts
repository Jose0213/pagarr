// Ported from NzbDrone.Core/Http/CachedHttpResponseRepository.cs
//
// Stub interface only -- the real implementation belongs to the Datastore
// module (`ICacheDatabase`-backed BasicRepository<T>), which is being
// ported in parallel per PORT_PLAN.md Phase 0. This defines exactly the
// surface CachedHttpResponseService needs (upsert + findByUrl, mirroring
// IBasicRepository<T>'s Upsert plus the one custom finder method Readarr
// added), so the caching behavior in this module can be built and tested
// now against a fake, then wired to the real SQLite-backed repository once
// Datastore lands.

import type { CachedHttpResponse } from "./CachedHttpResponse.js";

export interface ICachedHttpResponseRepository {
  findByUrl(url: string): CachedHttpResponse | null;
  upsert(entry: CachedHttpResponse): CachedHttpResponse;
}
