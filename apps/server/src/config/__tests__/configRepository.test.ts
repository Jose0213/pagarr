import { describe, expect, it } from "vitest";
import { ConfigRepository } from "../configRepository.js";
import { InMemoryKeyValueRepository } from "../keyValueRepository.js";

describe("ConfigRepository", () => {
  it("get() returns undefined for a key that was never set", () => {
    const repo = new ConfigRepository(new InMemoryKeyValueRepository());
    expect(repo.get("missing")).toBeUndefined();
  });

  it("upsert() inserts a new row, then updates it in place on a second call", () => {
    const kv = new InMemoryKeyValueRepository();
    const repo = new ConfigRepository(kv);

    const inserted = repo.upsert("Port", "8787");
    expect(inserted.key).toBe("port");
    expect(inserted.value).toBe("8787");
    expect(repo.all()).toHaveLength(1);

    const updated = repo.upsert("PORT", "9999");
    expect(updated.value).toBe("9999");
    // Still just one row -- upsert updated in place, did not insert a second row.
    expect(repo.all()).toHaveLength(1);
    expect(repo.get("port")?.value).toBe("9999");
  });

  it("keys are always lower-invariant, matching Config.cs's Key setter", () => {
    const repo = new ConfigRepository(new InMemoryKeyValueRepository());
    repo.upsert("MixedCaseKey", "value");

    expect(repo.get("MixedCaseKey")?.key).toBe("mixedcasekey");
    expect(repo.get("mixedcasekey")?.value).toBe("value");
  });

  it("all() returns every stored row", () => {
    const repo = new ConfigRepository(new InMemoryKeyValueRepository());
    repo.upsert("a", "1");
    repo.upsert("b", "2");
    repo.upsert("c", "3");

    const rows = repo.all();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.key).sort()).toEqual(["a", "b", "c"]);
  });
});
