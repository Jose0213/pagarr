import { describe, expect, it, vi } from "vitest";
import { CustomFormatService } from "../customFormatService.js";
import { newCustomFormat } from "../customFormat.js";
import { CustomFormatAddedEvent, CustomFormatDeletedEvent } from "../events.js";
import type { CustomFormatRepository } from "../customFormatRepository.js";

function makeRepo(overrides: Partial<CustomFormatRepository> = {}): CustomFormatRepository {
  return {
    all: vi.fn(() => []),
    get: vi.fn(),
    find: vi.fn(),
    getMany: vi.fn(),
    insert: vi.fn((f) => ({ ...f, id: 1 })),
    update: vi.fn((f) => f),
    delete: vi.fn(),
    count: vi.fn(() => 0),
    hasItems: vi.fn(() => false),
    purge: vi.fn(),
    ...overrides,
  } as unknown as CustomFormatRepository;
}

describe("CustomFormatService", () => {
  describe("all/getById caching (AllDictionary)", () => {
    it("caches repository.all() results across calls until a write happens", () => {
      const all = vi.fn(() => [newCustomFormat("A")]);
      const repo = makeRepo({ all });
      const service = new CustomFormatService(repo);

      service.all();
      service.all();
      service.getById(0);

      expect(all).toHaveBeenCalledTimes(1);
    });

    it("getById throws for a missing id (dictionary indexer KeyNotFoundException equivalent)", () => {
      const repo = makeRepo({ all: vi.fn(() => []) });
      const service = new CustomFormatService(repo);

      expect(() => service.getById(999)).toThrow(/999/);
    });

    it("insert() clears the cache so the next all() re-queries the repository", () => {
      const all = vi.fn(() => [newCustomFormat("A")]);
      const repo = makeRepo({ all, insert: vi.fn((f) => ({ ...f, id: 2 })) });
      const service = new CustomFormatService(repo);

      service.all();
      service.insert(newCustomFormat("B"));
      service.all();

      expect(all).toHaveBeenCalledTimes(2);
    });

    it("update() clears the cache", () => {
      const all = vi.fn(() => [newCustomFormat("A")]);
      const repo = makeRepo({ all });
      const service = new CustomFormatService(repo);

      service.all();
      service.update({ ...newCustomFormat("A"), id: 1 });
      service.all();

      expect(all).toHaveBeenCalledTimes(2);
    });

    it("delete() clears the cache", () => {
      const format = { ...newCustomFormat("A"), id: 1 };
      const all = vi.fn(() => [format]);
      const repo = makeRepo({ all, get: vi.fn(() => format) });
      const service = new CustomFormatService(repo);

      service.all();
      service.delete(1);
      service.all();

      expect(all).toHaveBeenCalledTimes(2);
    });
  });

  describe("insert", () => {
    it("inserts via the repository and publishes CustomFormatAddedEvent with the inserted result", () => {
      const inserted = { ...newCustomFormat("New"), id: 42 };
      const repo = makeRepo({ insert: vi.fn(() => inserted) });
      const publishEvent = vi.fn();

      const service = new CustomFormatService(repo, { publishEvent });
      const result = service.insert(newCustomFormat("New"));

      expect(result).toEqual(inserted);
      expect(publishEvent).toHaveBeenCalledTimes(1);
      const event = publishEvent.mock.calls[0]?.[0];
      expect(event).toBeInstanceOf(CustomFormatAddedEvent);
      expect((event as CustomFormatAddedEvent).customFormat).toEqual(inserted);
    });
  });

  describe("delete", () => {
    it("publishes CustomFormatDeletedEvent BEFORE removing the row from the repository", () => {
      const format = { ...newCustomFormat("ToDelete"), id: 7 };
      const calls: string[] = [];

      const repo = makeRepo({
        get: vi.fn(() => format),
        delete: vi.fn(() => {
          calls.push("repo.delete");
        }),
      });
      const publishEvent = vi.fn(() => {
        calls.push("publishEvent");
      });

      const service = new CustomFormatService(repo, { publishEvent });
      service.delete(7);

      expect(calls).toEqual(["publishEvent", "repo.delete"]);
      expect(repo.delete).toHaveBeenCalledWith(7);
    });

    it("publishes CustomFormatDeletedEvent carrying the format that was deleted", () => {
      const format = { ...newCustomFormat("ToDelete"), id: 7 };
      const repo = makeRepo({ get: vi.fn(() => format) });
      const publishEvent = vi.fn();

      const service = new CustomFormatService(repo, { publishEvent });
      service.delete(7);

      const event = publishEvent.mock.calls[0]?.[0];
      expect(event).toBeInstanceOf(CustomFormatDeletedEvent);
      expect((event as CustomFormatDeletedEvent).customFormat).toEqual(format);
    });
  });

  it("works with no event aggregator provided (NullCustomFormatEventAggregator default)", () => {
    const repo = makeRepo({ insert: vi.fn((f) => ({ ...f, id: 1 })) });
    const service = new CustomFormatService(repo);

    expect(() => service.insert(newCustomFormat("NoAggregator"))).not.toThrow();
  });
});
