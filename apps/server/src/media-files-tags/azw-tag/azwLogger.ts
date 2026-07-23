/**
 * Minimal logger surface this module needs, matching NLog's `Logger` for the
 * subset of methods actually called (`ExtMeta.cs` uses `Logger.Warn` and
 * `Logger.Debug`). Same pattern as `indexers/indexerBase.ts`'s
 * `IndexerLogger`/`noopIndexerLogger` -- the Instrumentation module itself
 * isn't ported yet (Phase 4), so callers inject any object matching this
 * shape (or accept the no-op default).
 */
export interface AzwLogger {
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

export const noopAzwLogger: AzwLogger = {
  debug: () => {},
  warn: () => {},
};
