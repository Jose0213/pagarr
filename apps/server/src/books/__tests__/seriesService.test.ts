import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { SeriesRepository } from "../seriesRepository.js";
import { SeriesService } from "../seriesService.js";
import type { MainDatabase } from "../../db/db-factory.js";
import type { Series } from "../models.js";

describe("SeriesService", () => {
  let db: MainDatabase;
  let repo: SeriesRepository;
  let service: SeriesService;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SeriesRepository(db);
    service = new SeriesService(repo);
  });

  afterEach(() => {
    db.close();
  });

  function series(overrides: Partial<Series> = {}): Series {
    return {
      id: 0,
      foreignSeriesId: overrides.foreignSeriesId ?? `fs-${Math.random()}`,
      title: "A Series",
      description: null,
      numbered: true,
      workCount: 1,
      primaryWorkCount: 1,
      ...overrides,
    };
  }

  it("findById (single string) delegates to repository.findById", () => {
    const inserted = repo.insert(series({ foreignSeriesId: "fs-1" }));
    expect(service.findById("fs-1")?.id).toBe(inserted.id);
    expect(service.findById("missing")).toBeUndefined();
  });

  it("findById (string array) delegates to repository.findByIds", () => {
    repo.insert(series({ foreignSeriesId: "fs-1" }));
    repo.insert(series({ foreignSeriesId: "fs-2" }));

    const results = service.findById(["fs-1", "fs-2"]);
    expect(results).toHaveLength(2);
  });

  it("insertMany / updateMany / delete delegate straight through", () => {
    service.insertMany([series({ foreignSeriesId: "fs-1" })]);
    expect(repo.count()).toBe(1);

    const [inserted] = repo.all();
    service.updateMany([{ ...inserted!, title: "Updated" }]);
    expect(repo.get(inserted!.id).title).toBe("Updated");

    service.delete(inserted!.id);
    expect(repo.count()).toBe(0);
  });
});
