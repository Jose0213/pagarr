/**
 * Ported from NzbDrone.Core/Datastore/WhereBuilder.cs + WhereBuilderSqlite.cs.
 *
 * C# built WHERE clauses by walking `Expression<Func<TModel, bool>>` LINQ
 * expression trees at runtime (VisitBinary/VisitMethodCall/VisitMemberAccess
 * in WhereBuilderSqlite), supporting: ==, !=, >, >=, <, <=, AND, OR, IS
 * (NULL)/IS NOT (NULL), string.Contains/StartsWith/EndsWith (-> LIKE), and
 * IEnumerable.Contains (-> IN (...)).
 *
 * TypeScript has no expression-tree equivalent, so callers build the same
 * logical conditions with a small typed object structure instead of lambdas.
 * This is the "plain filter objects" adaptation flagged as the intended
 * approach in the port brief. The supported operator set below is a 1:1
 * match to what WhereBuilderSqlite actually implements (nothing more,
 * nothing less), so BasicRepository callers ported from C# using
 * `x => x.Foo == bar` should translate directly to
 * `{ field: "foo", op: "eq", value: bar }`.
 */

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains" // string.Contains -> LIKE '%value%'
  | "startsWith" // string.StartsWith -> LIKE 'value%'
  | "endsWith" // string.EndsWith -> LIKE '%value'
  | "in"; // IEnumerable.Contains -> IN (...)

export interface FilterCondition<TModel> {
  field: keyof TModel & string;
  op: FilterOperator;
  value: unknown;
}

export interface FilterAnd<TModel> {
  and: FilterExpression<TModel>[];
}

export interface FilterOr<TModel> {
  or: FilterExpression<TModel>[];
}

export type FilterExpression<TModel> =
  FilterCondition<TModel> | FilterAnd<TModel> | FilterOr<TModel>;

export function isCondition<TModel>(
  expr: FilterExpression<TModel>
): expr is FilterCondition<TModel> {
  return "field" in expr;
}

export function isAnd<TModel>(expr: FilterExpression<TModel>): expr is FilterAnd<TModel> {
  return "and" in expr;
}

export function isOr<TModel>(expr: FilterExpression<TModel>): expr is FilterOr<TModel> {
  return "or" in expr;
}

interface CompiledCondition {
  sql: string;
  params: unknown[];
}

/**
 * Compiles a FilterExpression to a parameterized SQL fragment + positional
 * params, mirroring WhereBuilderSqlite's Decode()/VisitBinary/VisitMethodCall
 * behavior: `eq`/`ne` against a JS `null` value become `IS`/`IS NOT NULL`
 * (matching WhereBuilderSqlite.IsNullVariable + Decode's null special-case),
 * everything else is a direct operator with a bound `?` placeholder.
 *
 * `columnFor` maps a model field name to its quoted `"Table"."Column"` SQL
 * reference (WhereBuilderSqlite.VisitMemberAccess did this via
 * TableMapping.Mapper.TableNameMapping + reflection; here the caller-supplied
 * column list already knows the table name, so it's passed in explicitly).
 */
export function compileFilter<TModel>(
  expr: FilterExpression<TModel>,
  columnFor: (field: string) => string
): CompiledCondition {
  if (isAnd(expr)) {
    const parts = expr.and.map((e) => compileFilter(e, columnFor));
    return {
      sql: "(" + parts.map((p) => p.sql).join(" AND ") + ")",
      params: parts.flatMap((p) => p.params),
    };
  }

  if (isOr(expr)) {
    const parts = expr.or.map((e) => compileFilter(e, columnFor));
    return {
      sql: "(" + parts.map((p) => p.sql).join(" OR ") + ")",
      params: parts.flatMap((p) => p.params),
    };
  }

  const column = columnFor(expr.field);
  const { op, value } = expr;

  if ((op === "eq" || op === "ne") && value === null) {
    return { sql: `${column} ${op === "eq" ? "IS" : "IS NOT"} NULL`, params: [] };
  }

  switch (op) {
    case "eq":
      return { sql: `${column} = ?`, params: [value] };
    case "ne":
      return { sql: `${column} <> ?`, params: [value] };
    case "gt":
      return { sql: `${column} > ?`, params: [value] };
    case "gte":
      return { sql: `${column} >= ?`, params: [value] };
    case "lt":
      return { sql: `${column} < ?`, params: [value] };
    case "lte":
      return { sql: `${column} <= ?`, params: [value] };
    case "contains":
      return { sql: `${column} LIKE '%' || ? || '%'`, params: [value] };
    case "startsWith":
      return { sql: `${column} LIKE ? || '%'`, params: [value] };
    case "endsWith":
      return { sql: `${column} LIKE '%' || ?`, params: [value] };
    case "in": {
      const values = value as unknown[];
      if (values.length === 0) {
        // Empty IN(): never matches. Ported semantics: WhereBuilderSqlite's
        // ParseEnumerableContains would hardcode an empty int list as
        // "IN ()", which SQLite also treats as always-false.
        return { sql: "0", params: [] };
      }
      return {
        sql: `${column} IN (${values.map(() => "?").join(", ")})`,
        params: values,
      };
    }
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unsupported filter operator: ${String(_exhaustive)}`);
    }
  }
}
