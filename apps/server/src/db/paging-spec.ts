import type { FilterExpression } from "./filter.js";

/**
 * Ported from NzbDrone.Core/Datastore/PagingSpec.cs.
 *
 * C# used `SortDirection.Default/Ascending/Descending` (Default meaning "no
 * explicit direction given", collapsing to Ascending in BasicRepository's
 * GetPagedRecords). Kept as the same three-value enum for shape fidelity.
 */
export enum SortDirection {
  Default = "Default",
  Ascending = "Ascending",
  Descending = "Descending",
}

/**
 * C#'s `PagingSpec<TModel>` carried `List<Expression<Func<TModel, bool>>>`
 * FilterExpressions -- LINQ expression trees that WhereBuilderSqlite walked
 * to produce parameterized SQL. TypeScript has no expression-tree
 * equivalent, so `FilterExpressions` here is a list of `FilterExpression<T>`
 * plain-object filter conditions (see filter.ts) that a small builder
 * compiles to SQL the same way WhereBuilderSqlite did for the C# trees.
 * Every other field/method name and the paging semantics (1-based Page,
 * PageSize, TotalRecords populated by GetPaged) carry over unchanged.
 */
export class PagingSpec<TModel> {
  page = 0;
  pageSize = 0;
  totalRecords = 0;
  sortKey: string | null = null;
  sortDirection: SortDirection = SortDirection.Default;
  records: TModel[] = [];
  filterExpressions: FilterExpression<TModel>[] = [];
}
