import { describe, expect, it } from "vitest";
import { compileFilter, type FilterExpression } from "./filter.js";

interface Widget {
  id: number;
  name: string;
  priority: number;
}

const columnFor = (field: string) => `"Widgets"."${field === "id" ? "Id" : field[0]!.toUpperCase() + field.slice(1)}"`;

describe("compileFilter", () => {
  it("compiles eq against a non-null value", () => {
    const result = compileFilter<Widget>({ field: "name", op: "eq", value: "Alpha" }, columnFor);
    expect(result.sql).toBe('"Widgets"."Name" = ?');
    expect(result.params).toEqual(["Alpha"]);
  });

  it("compiles eq against null as IS NULL (matches WhereBuilderSqlite's Decode null special-case)", () => {
    const result = compileFilter<Widget>({ field: "name", op: "eq", value: null }, columnFor);
    expect(result.sql).toBe('"Widgets"."Name" IS NULL');
    expect(result.params).toEqual([]);
  });

  it("compiles ne against null as IS NOT NULL", () => {
    const result = compileFilter<Widget>({ field: "name", op: "ne", value: null }, columnFor);
    expect(result.sql).toBe('"Widgets"."Name" IS NOT NULL');
  });

  it("compiles comparison operators", () => {
    expect(compileFilter<Widget>({ field: "priority", op: "gt", value: 5 }, columnFor).sql).toBe(
      '"Widgets"."Priority" > ?'
    );
    expect(compileFilter<Widget>({ field: "priority", op: "gte", value: 5 }, columnFor).sql).toBe(
      '"Widgets"."Priority" >= ?'
    );
    expect(compileFilter<Widget>({ field: "priority", op: "lt", value: 5 }, columnFor).sql).toBe(
      '"Widgets"."Priority" < ?'
    );
    expect(compileFilter<Widget>({ field: "priority", op: "lte", value: 5 }, columnFor).sql).toBe(
      '"Widgets"."Priority" <= ?'
    );
    expect(compileFilter<Widget>({ field: "priority", op: "ne", value: 5 }, columnFor).sql).toBe(
      '"Widgets"."Priority" <> ?'
    );
  });

  it("compiles string operators to LIKE patterns matching WhereBuilderSqlite's ParseContains/StartsWith/EndsWith", () => {
    expect(compileFilter<Widget>({ field: "name", op: "contains", value: "x" }, columnFor).sql).toBe(
      `"Widgets"."Name" LIKE '%' || ? || '%'`
    );
    expect(compileFilter<Widget>({ field: "name", op: "startsWith", value: "x" }, columnFor).sql).toBe(
      `"Widgets"."Name" LIKE ? || '%'`
    );
    expect(compileFilter<Widget>({ field: "name", op: "endsWith", value: "x" }, columnFor).sql).toBe(
      `"Widgets"."Name" LIKE '%' || ?`
    );
  });

  it("compiles 'in' with a non-empty list", () => {
    const result = compileFilter<Widget>({ field: "priority", op: "in", value: [1, 2, 3] }, columnFor);
    expect(result.sql).toBe('"Widgets"."Priority" IN (?, ?, ?)');
    expect(result.params).toEqual([1, 2, 3]);
  });

  it("compiles 'in' with an empty list to an always-false condition", () => {
    const result = compileFilter<Widget>({ field: "priority", op: "in", value: [] }, columnFor);
    expect(result.sql).toBe("0");
    expect(result.params).toEqual([]);
  });

  it("compiles AND groups", () => {
    const expr: FilterExpression<Widget> = {
      and: [
        { field: "name", op: "eq", value: "A" },
        { field: "priority", op: "gt", value: 1 },
      ],
    };
    const result = compileFilter(expr, columnFor);
    expect(result.sql).toBe('("Widgets"."Name" = ? AND "Widgets"."Priority" > ?)');
    expect(result.params).toEqual(["A", 1]);
  });

  it("compiles OR groups", () => {
    const expr: FilterExpression<Widget> = {
      or: [
        { field: "name", op: "eq", value: "A" },
        { field: "name", op: "eq", value: "B" },
      ],
    };
    const result = compileFilter(expr, columnFor);
    expect(result.sql).toBe('("Widgets"."Name" = ? OR "Widgets"."Name" = ?)');
    expect(result.params).toEqual(["A", "B"]);
  });

  it("supports nesting AND inside OR", () => {
    const expr: FilterExpression<Widget> = {
      or: [
        { and: [{ field: "name", op: "eq", value: "A" }, { field: "priority", op: "gt", value: 1 }] },
        { field: "name", op: "eq", value: "B" },
      ],
    };
    const result = compileFilter(expr, columnFor);
    expect(result.sql).toBe(
      '(("Widgets"."Name" = ? AND "Widgets"."Priority" > ?) OR "Widgets"."Name" = ?)'
    );
    expect(result.params).toEqual(["A", 1, "B"]);
  });
});
