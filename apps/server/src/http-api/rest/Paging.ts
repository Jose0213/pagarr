import type { Request } from "express";
import { PagingSpec, SortDirection } from "../../db/paging-spec.js";

/**
 * Ported from Readarr.Http/PagingResource.cs (`PagingRequestResource`/
 * `PagingResource<TResource>`/`PagingResourceMapper.MapToPagingSpec`) and
 * the `ApplyToPage` extension method from
 * Readarr.Http/Extensions/RequestExtensions.cs. Both are real,
 * `Readarr.Http`-namespaced (composition-root-layer, not
 * `Readarr.Api.V1`-specific) helpers -- ported here, alongside
 * RestController.ts/ResourceValidator.ts, as small additive reusable
 * infrastructure any Phase 5 resource-controller group can import (not
 * duplicated per-group), matching how this composition root already
 * centralizes RestController/RestControllerWithSignalR/ResourceValidator.
 *
 * THE CANONICAL PAGINATION HELPER (established during merge reconciliation):
 * `api-queue-history-blocklist` (Queue/History/Blocklist/Wanted) independently
 * built its own `resources/shared/pagingResource.ts` with an equivalent
 * `PagingRequestResource`/`PagingResourceEnvelope`/`mapToPagingSpec`/
 * `applyToPage` set before this file existed on `main`. Reconciled to THIS
 * file as the single source of truth (deleted the other) because:
 *   - `applyToPage` here is SYNCHRONOUS, matching the real C# `ApplyToPage`
 *     exactly (`PagingSpec<TModel> function(PagingSpec<TModel>)`, no async
 *     anywhere in the real signature) -- the other version made it
 *     `Promise`-returning "for forward compatibility," but EVERY real data
 *     source across every consumer (Queue/History/Blocklist/Wanted's
 *     services, this file's own `LogService`) is synchronous; the async
 *     wrapping was unexercised surface, not a real requirement.
 *   - `mapToPagingSpec` here takes the fully-defaulted `PagingResource
 *     <TResource>` (built via `buildPagingResource` from the raw
 *     `PagingRequestResource`), matching the real C# structure exactly:
 *     `PagingRequestResource` (raw bind) -> `new PagingResource<T>(paging)`
 *     (ctor applies `Page ??= 1`/etc, ALSO real code) -> `.MapToPagingSpec()`
 *     (extension method on the already-defaulted object). The other version
 *     collapsed the middle step into `mapToPagingSpec` itself -- fewer call-
 *     site lines, but two real C# steps folded into one TS function.
 *   - This file lives in `http-api/rest/`, alongside the rest of the shared
 *     REST composition-root plumbing (`RestController.ts`,
 *     `ProviderControllerBase.ts`, `ResourceValidator.ts`) rather than under
 *     `resources/shared/` (a resource-group-adjacent location the other
 *     version chose since it predated this file on that branch).
 *
 * The real, faithfully-preserved C# quirk BOTH versions independently
 * discovered and got right -- preserved here: `sortDirection` defaults to
 * `Descending` at the `PagingResource` CONSTRUCTOR level (`SortDirection
 * ??= SortDirection.Descending`, applied unconditionally in
 * `buildPagingResource` below), which is A DIFFERENT default than
 * `mapToPagingSpec`'s OWN `defaultSortDirection` parameter (commonly
 * `Ascending`) -- and the two only interact when a caller's OWN sortKey was
 * unset AND the resource's sortDirection is the LITERAL enum value
 * `Default` (not merely "unset", since `buildPagingResource` already turned
 * "unset" into `Descending` before `mapToPagingSpec` ever runs). See
 * `mapToPagingSpec`'s own doc comment below and this file's test suite
 * (`Paging.test.ts`) for the exact precedence, asserted directly.
 */

/** Ported from `PagingRequestResource` -- the raw `[FromQuery]`-bound query-string shape (all fields optional/nullable, matching ASP.NET's model binder producing `null` for an absent query param). */
export interface PagingRequestResource {
  page?: number;
  pageSize?: number;
  sortKey?: string;
  sortDirection?: SortDirection;
}

/** Ported from `PagingResource<TResource>` -- the wire response envelope. */
export interface PagingResource<TResource> {
  page: number;
  pageSize: number;
  sortKey: string | null;
  sortDirection: SortDirection;
  totalRecords: number;
  records: TResource[];
}

/**
 * Ported from `PagingRequestResource`'s Express query-string parsing (the
 * ASP.NET model-binder equivalent for this specific shape): reads
 * `page`/`pageSize` as integers (`[DefaultValue(1)]`/`[DefaultValue(10)]`
 * only apply to Swagger metadata in the real source, NOT actual binding
 * defaults -- the true defaults are applied later, in
 * `PagingResource(PagingRequestResource)`'s ctor, ported below as
 * `buildPagingResource`), `sortKey` as a raw string, `sortDirection` by
 * name (`Ascending`/`Descending`/`Default`, matching the C# enum's JSON
 * string names -- see enumWireName.ts's doc comment for why enums are
 * strings on this port's wire).
 */
export function parsePagingRequest(req: Request): PagingRequestResource {
  const query = req.query;
  const result: PagingRequestResource = {};

  const page = query["page"];
  if (typeof page === "string" && page !== "") {
    const parsed = Number.parseInt(page, 10);
    if (!Number.isNaN(parsed)) {
      result.page = parsed;
    }
  }

  const pageSize = query["pageSize"];
  if (typeof pageSize === "string" && pageSize !== "") {
    const parsed = Number.parseInt(pageSize, 10);
    if (!Number.isNaN(parsed)) {
      result.pageSize = parsed;
    }
  }

  const sortKey = query["sortKey"];
  if (typeof sortKey === "string" && sortKey !== "") {
    result.sortKey = sortKey;
  }

  const sortDirection = query["sortDirection"];
  if (typeof sortDirection === "string" && sortDirection in SortDirection) {
    result.sortDirection = SortDirection[sortDirection as keyof typeof SortDirection];
  }

  return result;
}

/** Ported from `PagingResource(PagingRequestResource requestResource)`'s ctor: applies the REAL bind-time defaults (Page=1, PageSize=10, SortDirection=Descending). */
export function buildPagingResource<TResource>(
  request: PagingRequestResource
): PagingResource<TResource> {
  return {
    page: request.page ?? 1,
    pageSize: request.pageSize ?? 10,
    sortKey: request.sortKey ?? null,
    sortDirection: request.sortDirection ?? SortDirection.Descending,
    totalRecords: 0,
    records: [],
  };
}

/** Ported from `PagingResourceMapper.MapToPagingSpec<TResource, TModel>`. */
export function mapToPagingSpec<TResource, TModel>(
  pagingResource: PagingResource<TResource>,
  defaultSortKey = "id",
  defaultSortDirection: SortDirection = SortDirection.Ascending
): PagingSpec<TModel> {
  const pagingSpec = new PagingSpec<TModel>();
  pagingSpec.page = pagingResource.page;
  pagingSpec.pageSize = pagingResource.pageSize;
  pagingSpec.sortKey = pagingResource.sortKey;
  pagingSpec.sortDirection = pagingResource.sortDirection;

  if (pagingResource.sortKey === null) {
    pagingSpec.sortKey = defaultSortKey;
    if (pagingResource.sortDirection === SortDirection.Default) {
      pagingSpec.sortDirection = defaultSortDirection;
    }
  }

  return pagingSpec;
}

/** Ported from `RequestExtensions.ApplyToPage<TResource, TModel>`. */
export function applyToPage<TResource, TModel>(
  pagingSpec: PagingSpec<TModel>,
  fn: (spec: PagingSpec<TModel>) => PagingSpec<TModel>,
  mapper: (model: TModel) => TResource
): PagingResource<TResource> {
  const result = fn(pagingSpec);

  return {
    page: result.page,
    pageSize: result.pageSize,
    sortDirection: result.sortDirection,
    sortKey: result.sortKey,
    totalRecords: result.totalRecords,
    records: result.records.map(mapper),
  };
}
