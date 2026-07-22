import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Database, type IDatabase } from "./database.js";
import { BasicRepository, type ColumnMapping } from "./basic-repository.js";
import { PagingSpec, SortDirection } from "./paging-spec.js";
import type { ModelBase } from "./model-base.js";
import { ModelNotFoundException } from "./errors.js";
import { ModelAction, ModelEvent, type IEventAggregator } from "./events.js";

/**
 * Test fixture table + model, standing in for a real ported entity (e.g.
 * Books). Exercises multiple column types and a plausible filter/sort
 * surface so GetPaged's WHERE + ORDER BY + LIMIT/OFFSET logic is proven
 * against more than a single-column table like Tags.
 */
interface Widget extends ModelBase {
  name: string;
  monitored: boolean;
  priority: number;
}

const WIDGET_COLUMNS: ColumnMapping<Widget>[] = [
  { prop: "name", column: "Name" },
  { prop: "monitored", column: "Monitored", type: "boolean" },
  { prop: "priority", column: "Priority" },
];

class WidgetRepository extends BasicRepository<Widget> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "Widgets", columns: WIDGET_COLUMNS, eventAggregator });
  }
}

class PublishingWidgetRepository extends WidgetRepository {
  protected override get publishModelEvents(): boolean {
    return true;
  }
}

function makeDatabase(): { db: IDatabase; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "Widgets" (
      "Id" INTEGER PRIMARY KEY,
      "Name" TEXT NOT NULL,
      "Monitored" INTEGER NOT NULL,
      "Priority" INTEGER NOT NULL
    );
  `);
  return { db: new Database("Test", sqlite), sqlite };
}

describe("BasicRepository", () => {
  let db: IDatabase;
  let repo: WidgetRepository;

  beforeEach(() => {
    ({ db } = makeDatabase());
    repo = new WidgetRepository(db);
  });

  describe("insert", () => {
    it("inserts a model with id 0 and assigns a generated id", () => {
      const inserted = repo.insert({ id: 0, name: "Alpha", monitored: true, priority: 1 } as Widget);

      expect(inserted.id).toBeGreaterThan(0);
      expect(repo.get(inserted.id)).toEqual(inserted);
    });

    it("throws if the model already has a non-zero id", () => {
      expect(() =>
        repo.insert({ id: 5, name: "Bad", monitored: false, priority: 1 } as Widget)
      ).toThrow(/existing ID 5/);
    });

    it("insertMany inserts all models transactionally", () => {
      const inserted = repo.insertMany([
        { id: 0, name: "A", monitored: true, priority: 1 } as Widget,
        { id: 0, name: "B", monitored: false, priority: 2 } as Widget,
      ]);

      expect(inserted).toHaveLength(2);
      expect(repo.count()).toBe(2);
      expect(inserted[0]!.id).not.toBe(inserted[1]!.id);
    });

    it("insertMany rejects if any model already has an id", () => {
      expect(() =>
        repo.insertMany([{ id: 1, name: "A", monitored: true, priority: 1 } as Widget])
      ).toThrow(/existing ID/);
    });
  });

  describe("find/get", () => {
    it("find returns undefined for a missing id", () => {
      expect(repo.find(999)).toBeUndefined();
    });

    it("get throws ModelNotFoundException for a missing id", () => {
      expect(() => repo.get(999)).toThrow(ModelNotFoundException);
      expect(() => repo.get(999)).toThrow(/Widgets with ID 999 does not exist/);
    });

    it("getMany returns all matching rows", () => {
      const a = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      const b = repo.insert({ id: 0, name: "B", monitored: false, priority: 2 } as Widget);

      const result = repo.getMany([a.id, b.id]);
      expect(result).toHaveLength(2);
    });

    it("getMany throws if the returned row count doesn't match requested ids", () => {
      const a = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);

      expect(() => repo.getMany([a.id, 999])).toThrow(/Expected query to return 2 rows but returned 1/);
    });

    it("getMany returns an empty array for an empty id list", () => {
      expect(repo.getMany([])).toEqual([]);
    });
  });

  describe("update", () => {
    it("updates all columns of an existing model", () => {
      const inserted = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);

      const updated = repo.update({ ...inserted, name: "A2", priority: 9 });

      expect(updated.name).toBe("A2");
      expect(repo.get(inserted.id).priority).toBe(9);
    });

    it("throws if the model has id 0", () => {
      expect(() => repo.update({ id: 0, name: "X", monitored: true, priority: 1 } as Widget)).toThrow(
        /Can't update model with ID 0/
      );
    });

    it("updateMany updates all given models", () => {
      const a = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      const b = repo.insert({ id: 0, name: "B", monitored: false, priority: 2 } as Widget);

      repo.updateMany([
        { ...a, priority: 10 },
        { ...b, priority: 20 },
      ]);

      expect(repo.get(a.id).priority).toBe(10);
      expect(repo.get(b.id).priority).toBe(20);
    });
  });

  describe("setFields", () => {
    it("updates only the named properties, leaving others untouched", () => {
      const inserted = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);

      repo.setFields({ ...inserted, priority: 42, name: "ignored-should-not-persist" }, ["priority"]);

      const reloaded = repo.get(inserted.id);
      expect(reloaded.priority).toBe(42);
      expect(reloaded.name).toBe("A");
    });

    it("throws if the model has id 0", () => {
      expect(() =>
        repo.setFields({ id: 0, name: "X", monitored: true, priority: 1 } as Widget, ["priority"])
      ).toThrow(/Attempted to update model without ID/);
    });
  });

  describe("upsert", () => {
    it("inserts when id is 0", () => {
      const result = repo.upsert({ id: 0, name: "New", monitored: true, priority: 1 } as Widget);
      expect(result.id).toBeGreaterThan(0);
      expect(repo.count()).toBe(1);
    });

    it("updates when id is non-zero", () => {
      const inserted = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      repo.upsert({ ...inserted, name: "Changed" });

      expect(repo.get(inserted.id).name).toBe("Changed");
      expect(repo.count()).toBe(1);
    });
  });

  describe("delete", () => {
    it("deletes by id", () => {
      const inserted = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      repo.delete(inserted.id);
      expect(repo.find(inserted.id)).toBeUndefined();
    });

    it("deletes by model", () => {
      const inserted = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      repo.delete(inserted);
      expect(repo.find(inserted.id)).toBeUndefined();
    });

    it("deleteMany deletes by a list of ids", () => {
      const a = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      const b = repo.insert({ id: 0, name: "B", monitored: true, priority: 2 } as Widget);
      const c = repo.insert({ id: 0, name: "C", monitored: true, priority: 3 } as Widget);

      repo.deleteMany([a.id, b.id]);

      expect(repo.count()).toBe(1);
      expect(repo.find(c.id)).toBeDefined();
    });

    it("deleteMany deletes by a list of models", () => {
      const a = repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      const b = repo.insert({ id: 0, name: "B", monitored: true, priority: 2 } as Widget);

      repo.deleteMany([a, b]);

      expect(repo.count()).toBe(0);
    });

    it("deleteMany is a no-op for an empty list", () => {
      repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      expect(() => repo.deleteMany([])).not.toThrow();
      expect(repo.count()).toBe(1);
    });
  });

  describe("purge/hasItems/count", () => {
    it("hasItems reflects whether the table has rows", () => {
      expect(repo.hasItems()).toBe(false);
      repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      expect(repo.hasItems()).toBe(true);
    });

    it("purge deletes all rows", () => {
      repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      repo.insert({ id: 0, name: "B", monitored: true, priority: 2 } as Widget);

      repo.purge();

      expect(repo.count()).toBe(0);
    });
  });

  describe("single/singleOrDefault/all", () => {
    it("all returns every row", () => {
      repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      repo.insert({ id: 0, name: "B", monitored: true, priority: 2 } as Widget);

      expect(repo.all()).toHaveLength(2);
    });

    it("single throws when there isn't exactly one row", () => {
      expect(() => repo.single()).toThrow();
      repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      expect(repo.single().name).toBe("A");
      repo.insert({ id: 0, name: "B", monitored: true, priority: 2 } as Widget);
      expect(() => repo.single()).toThrow();
    });

    it("singleOrDefault returns undefined when empty, throws when >1", () => {
      expect(repo.singleOrDefault()).toBeUndefined();
      repo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      expect(repo.singleOrDefault()!.name).toBe("A");
      repo.insert({ id: 0, name: "B", monitored: true, priority: 2 } as Widget);
      expect(() => repo.singleOrDefault()).toThrow();
    });
  });

  describe("getPaged", () => {
    beforeEach(() => {
      for (let i = 1; i <= 25; i++) {
        repo.insert({
          id: 0,
          name: `Widget${String(i).padStart(2, "0")}`,
          monitored: i % 2 === 0,
          priority: i,
        } as Widget);
      }
    });

    it("returns the requested page size and total record count", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 1;
      spec.pageSize = 10;
      spec.sortKey = "priority";
      spec.sortDirection = SortDirection.Ascending;

      const result = repo.getPaged(spec);

      expect(result.records).toHaveLength(10);
      expect(result.totalRecords).toBe(25);
      expect(result.records[0]!.priority).toBe(1);
      expect(result.records[9]!.priority).toBe(10);
    });

    it("returns the second page correctly (1-based paging)", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 2;
      spec.pageSize = 10;
      spec.sortKey = "priority";
      spec.sortDirection = SortDirection.Ascending;

      const result = repo.getPaged(spec);

      expect(result.records[0]!.priority).toBe(11);
      expect(result.records).toHaveLength(10);
    });

    it("sorts descending when requested", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 1;
      spec.pageSize = 5;
      spec.sortKey = "priority";
      spec.sortDirection = SortDirection.Descending;

      const result = repo.getPaged(spec);

      expect(result.records[0]!.priority).toBe(25);
      expect(result.records[4]!.priority).toBe(21);
    });

    it("defaults sortKey to id when not specified", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 1;
      spec.pageSize = 5;

      const result = repo.getPaged(spec);

      expect(result.records[0]!.id).toBeLessThan(result.records[4]!.id);
    });

    it("floors page numbers below 1 to page 1 (matches C#'s Math.Max(Page - 1, 0))", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 0;
      spec.pageSize = 5;
      spec.sortKey = "priority";
      spec.sortDirection = SortDirection.Ascending;

      const result = repo.getPaged(spec);

      expect(result.records[0]!.priority).toBe(1);
    });

    it("applies filter expressions and reflects them in totalRecords", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 1;
      spec.pageSize = 100;
      spec.sortKey = "priority";
      spec.sortDirection = SortDirection.Ascending;
      spec.filterExpressions = [{ field: "monitored", op: "eq", value: true }];

      const result = repo.getPaged(spec);

      expect(result.totalRecords).toBe(12); // even numbers 2,4,...,24
      expect(result.records.every((r) => r.monitored)).toBe(true);
    });

    it("supports compound AND/OR filter expressions", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 1;
      spec.pageSize = 100;
      spec.filterExpressions = [
        {
          and: [
            { field: "monitored", op: "eq", value: true },
            { field: "priority", op: "gte", value: 20 },
          ],
        },
      ];

      const result = repo.getPaged(spec);

      // even numbers >= 20: 20, 22, 24
      expect(result.totalRecords).toBe(3);
    });

    it("supports the 'contains' string operator", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 1;
      spec.pageSize = 100;
      spec.filterExpressions = [{ field: "name", op: "contains", value: "get1" }];

      const result = repo.getPaged(spec);

      // Widget10-Widget19 all contain "get1"
      expect(result.totalRecords).toBe(10);
    });

    it("supports the 'in' operator", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 1;
      spec.pageSize = 100;
      spec.filterExpressions = [{ field: "priority", op: "in", value: [1, 5, 9] }];

      const result = repo.getPaged(spec);

      expect(result.totalRecords).toBe(3);
    });

    it("mutates and returns the same PagingSpec instance passed in", () => {
      const spec = new PagingSpec<Widget>();
      spec.page = 1;
      spec.pageSize = 5;

      const result = repo.getPaged(spec);

      expect(result).toBe(spec);
    });
  });

  describe("model events", () => {
    it("does not publish events by default (publishModelEvents = false)", () => {
      const published: ModelEvent<Widget>[] = [];
      const aggregator: IEventAggregator = { publishEvent: (e) => published.push(e as ModelEvent<Widget>) };
      const eventRepo = new WidgetRepository(db, aggregator);

      eventRepo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);

      expect(published).toHaveLength(0);
    });

    it("publishes Created/Updated events when publishModelEvents is overridden true", () => {
      const published: ModelEvent<Widget>[] = [];
      const aggregator: IEventAggregator = { publishEvent: (e) => published.push(e as ModelEvent<Widget>) };
      const eventRepo = new PublishingWidgetRepository(db, aggregator);

      const inserted = eventRepo.insert({ id: 0, name: "A", monitored: true, priority: 1 } as Widget);
      eventRepo.update({ ...inserted, name: "A2" });

      expect(published).toHaveLength(2);
      expect(published[0]!.action).toBe(ModelAction.Created);
      expect(published[1]!.action).toBe(ModelAction.Updated);
    });
  });
});
