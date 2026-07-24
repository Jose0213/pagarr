import { describe, expect, it } from "vitest";
import {
  asBoolean,
  asFloat,
  asInt,
  asIntArray,
  asNullableFloat,
  asNullableInt,
  asString,
  asStringArray,
  buildFieldSchema,
  readFromFieldSchema,
  type FieldDefinition,
} from "../SchemaBuilder.js";

interface TestSettings {
  host: string;
  port: number;
  useSsl: boolean;
  tagIds: number[];
}

function defaultSettings(): TestSettings {
  return { host: "", port: 9999, useSsl: false, tagIds: [] };
}

const fieldDefs: FieldDefinition<TestSettings>[] = [
  {
    name: "port",
    label: "Port",
    type: "number",
    order: 1,
    get: (s) => s.port,
    set: (s, v) => {
      s.port = asInt(v, 9999);
    },
  },
  {
    name: "host",
    label: "Host",
    type: "textbox",
    order: 0,
    get: (s) => s.host,
    set: (s, v) => {
      s.host = asString(v);
    },
  },
  {
    name: "useSsl",
    label: "Use SSL",
    type: "checkbox",
    order: 2,
    get: (s) => s.useSsl,
    set: (s, v) => {
      s.useSsl = asBoolean(v);
    },
  },
  {
    name: "tagIds",
    label: "Tags",
    type: "tagSelect",
    order: 3,
    get: (s) => s.tagIds,
    set: (s, v) => {
      s.tagIds = asIntArray(v);
    },
  },
];

describe("buildFieldSchema", () => {
  it("builds a Field[] from a settings instance, populating each field's value", () => {
    const settings: TestSettings = {
      host: "example.com",
      port: 1234,
      useSsl: true,
      tagIds: [1, 2],
    };

    const fields = buildFieldSchema(settings, fieldDefs);

    expect(fields.find((f) => f.name === "host")?.value).toBe("example.com");
    expect(fields.find((f) => f.name === "port")?.value).toBe(1234);
    expect(fields.find((f) => f.name === "useSsl")?.value).toBe(true);
    expect(fields.find((f) => f.name === "tagIds")?.value).toEqual([1, 2]);
  });

  it("renumbers order 0..N-1 by declared order, not array position", () => {
    // fieldDefs is declared with port(order 1) before host(order 0) --
    // buildFieldSchema must sort by declared `order` first.
    const fields = buildFieldSchema(defaultSettings(), fieldDefs);

    expect(fields.map((f) => f.name)).toEqual(["host", "port", "useSsl", "tagIds"]);
    expect(fields.map((f) => f.order)).toEqual([0, 1, 2, 3]);
  });

  it("does not mutate the fieldDefs' own template on repeated calls", () => {
    buildFieldSchema({ host: "a", port: 1, useSsl: false, tagIds: [] }, fieldDefs);
    const second = buildFieldSchema({ host: "b", port: 2, useSsl: false, tagIds: [] }, fieldDefs);

    expect(second.find((f) => f.name === "host")?.value).toBe("b");
  });
});

describe("readFromFieldSchema", () => {
  it("constructs a fresh settings instance and applies each matching wire field", () => {
    const wireFields = [
      { name: "host", value: "wire-host" },
      { name: "port", value: "8080" },
      { name: "useSsl", value: true },
    ];

    const settings = readFromFieldSchema(wireFields, fieldDefs, defaultSettings);

    expect(settings.host).toBe("wire-host");
    expect(settings.port).toBe(8080);
    expect(settings.useSsl).toBe(true);
    // tagIds absent from wireFields -> factory default untouched.
    expect(settings.tagIds).toEqual([]);
  });

  it("leaves the factory default untouched for any field absent from the wire list", () => {
    const settings = readFromFieldSchema([], fieldDefs, defaultSettings);

    expect(settings).toEqual(defaultSettings());
  });
});

describe("value-coercion helpers", () => {
  it("asInt parses numeric strings and falls back to the default for garbage/absent input", () => {
    expect(asInt("42")).toBe(42);
    expect(asInt(undefined, 7)).toBe(7);
    expect(asInt("not-a-number", 7)).toBe(7);
  });

  it("asNullableInt returns null for absent/empty input instead of a default", () => {
    expect(asNullableInt(undefined)).toBeNull();
    expect(asNullableInt("")).toBeNull();
    expect(asNullableInt("5")).toBe(5);
  });

  it("asFloat/asNullableFloat parse decimal strings", () => {
    expect(asFloat("1.5")).toBe(1.5);
    expect(asNullableFloat(undefined)).toBeNull();
    expect(asNullableFloat("2.25")).toBe(2.25);
  });

  it("asIntArray accepts a real array or a comma-separated string", () => {
    expect(asIntArray([1, 2, 3])).toEqual([1, 2, 3]);
    expect(asIntArray("1, 2,3")).toEqual([1, 2, 3]);
    expect(asIntArray(undefined)).toEqual([]);
  });

  it("asStringArray accepts a real array or a comma-separated string", () => {
    expect(asStringArray(["a", "b"])).toEqual(["a", "b"]);
    expect(asStringArray("a, b")).toEqual(["a", "b"]);
    expect(asStringArray(null)).toEqual([]);
  });

  it("asBoolean passes through real booleans and parses string 'true'/'false'", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean("true")).toBe(true);
    expect(asBoolean("false")).toBe(false);
    expect(asBoolean(undefined, true)).toBe(true);
  });

  it("asString stringifies scalars without producing '[object Object]'", () => {
    expect(asString(42)).toBe("42");
    expect(asString(true)).toBe("true");
    expect(asString(undefined, "default")).toBe("default");
  });
});
