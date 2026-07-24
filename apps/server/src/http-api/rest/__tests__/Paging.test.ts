import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { SortDirection } from "../../../db/paging-spec.js";
import {
  applyToPage,
  buildPagingResource,
  mapToPagingSpec,
  parsePagingRequest,
} from "../Paging.js";

describe("parsePagingRequest", () => {
  it("parses page/pageSize/sortKey/sortDirection from query params", async () => {
    let captured: unknown;
    const app = express();
    app.get("/x", (req, res) => {
      captured = parsePagingRequest(req);
      res.json({});
    });

    await request(app)
      .get("/x")
      .query({ page: "2", pageSize: "25", sortKey: "time", sortDirection: "Descending" });

    expect(captured).toEqual({
      page: 2,
      pageSize: 25,
      sortKey: "time",
      sortDirection: SortDirection.Descending,
    });
  });

  it("omits fields absent from the query string", async () => {
    let captured: unknown;
    const app = express();
    app.get("/x", (req, res) => {
      captured = parsePagingRequest(req);
      res.json({});
    });

    await request(app).get("/x");

    expect(captured).toEqual({});
  });

  it("treats an unrecognized sortDirection value as absent (matches an unrecognized enum query param binding to null)", async () => {
    let captured: unknown;
    const app = express();
    app.get("/x", (req, res) => {
      captured = parsePagingRequest(req);
      res.json({});
    });

    await request(app).get("/x").query({ sortDirection: "sideways" });

    expect((captured as { sortDirection?: SortDirection }).sortDirection).toBeUndefined();
  });
});

describe("buildPagingResource", () => {
  it("applies real bind-time defaults: page=1, pageSize=10, sortDirection=Descending", () => {
    const resource = buildPagingResource({});

    expect(resource.page).toBe(1);
    expect(resource.pageSize).toBe(10);
    expect(resource.sortKey).toBeNull();
    expect(resource.sortDirection).toBe(SortDirection.Descending);
  });

  it("preserves explicit values", () => {
    const resource = buildPagingResource({ page: 3, pageSize: 50, sortKey: "level" });

    expect(resource.page).toBe(3);
    expect(resource.pageSize).toBe(50);
    expect(resource.sortKey).toBe("level");
  });
});

describe("mapToPagingSpec", () => {
  it("defaults sortKey when the resource's sortKey is null, keeping its own real sortDirection", () => {
    // buildPagingResource's own ctor-equivalent defaulting always sets a
    // real SortDirection (Descending) -- never Default -- so this is the
    // realistic shape a PagingResource(requestResource)-constructed value
    // actually has when it reaches MapToPagingSpec (see next test for the
    // Default-direction branch specifically).
    const resource = buildPagingResource<{ id: number }>({});

    const spec = mapToPagingSpec(resource, "id", SortDirection.Ascending);

    expect(spec.sortKey).toBe("id");
    expect(spec.sortDirection).toBe(SortDirection.Descending);
  });

  it("applies defaultSortDirection only when the resource's own sortDirection is literally Default", () => {
    // This branch is reachable in the real C# source only when a caller
    // builds a PagingResource<T> directly (bypassing the
    // PagingResource(requestResource) ctor that always assigns a concrete
    // direction) -- ported faithfully as a real, if narrow, branch.
    const resource = buildPagingResource<{ id: number }>({});
    resource.sortDirection = SortDirection.Default;

    const spec = mapToPagingSpec(resource, "id", SortDirection.Ascending);

    expect(spec.sortKey).toBe("id");
    expect(spec.sortDirection).toBe(SortDirection.Ascending);
  });

  it("keeps an explicit sortKey/sortDirection as-is", () => {
    const resource = buildPagingResource<{ id: number }>({
      sortKey: "time",
      sortDirection: SortDirection.Descending,
    });

    const spec = mapToPagingSpec(resource, "id", SortDirection.Ascending);

    expect(spec.sortKey).toBe("time");
    expect(spec.sortDirection).toBe(SortDirection.Descending);
  });
});

describe("applyToPage", () => {
  it("runs the paging function then maps records through the resource mapper", () => {
    const resource = buildPagingResource<{ doubled: number }>({ page: 1, pageSize: 10 });
    const spec = mapToPagingSpec<{ doubled: number }, { id: number; value: number }>(resource);

    const result = applyToPage(
      spec,
      (s) => {
        s.records = [{ id: 1, value: 5 }];
        s.totalRecords = 1;
        return s;
      },
      (model) => ({ doubled: model.value * 2 })
    );

    expect(result.records).toEqual([{ doubled: 10 }]);
    expect(result.totalRecords).toBe(1);
  });
});
