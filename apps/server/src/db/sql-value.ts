import type { SQLInputValue } from "node:sqlite";

/**
 * `node:sqlite`'s `SQLInputValue` is `null | number | bigint | string |
 * NodeJS.ArrayBufferView` -- notably no `boolean` or `undefined`, unlike
 * Dapper (used by the C# original), which happily bound C# `bool` model
 * properties directly as SQL parameters (SQLite itself has no boolean type;
 * Dapper/ADO.NET's SQLite provider silently converts to 0/1).
 *
 * This performs the same silent bool->0/1 conversion so callers can pass
 * plain model property values (which may be booleans, e.g. Monitored) the
 * same way the C# BasicRepository did, without every call site needing to
 * know about `node:sqlite`'s stricter typing.
 */
export function toSqlValue(value: unknown): SQLInputValue {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value as SQLInputValue;
}
