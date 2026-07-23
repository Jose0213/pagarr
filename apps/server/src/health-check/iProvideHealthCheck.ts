import type { IEvent } from "../messaging/index.js";
import type { HealthCheck } from "./healthCheck.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/IProvideHealthCheck.cs.
 *
 * `IProvideHealthCheckWithMessage` (an `IProvideHealthCheck` that can also
 * take the triggering `IEvent` into account, e.g. `RemotePathMappingCheck`)
 * is a distinct interface in C#; ported the same way rather than folding an
 * optional `check(message?)` onto the base, so `instanceof`-free duck typing
 * (`"check" in x && x.check.length >= 1` is unreliable across
 * implementations) isn't needed -- `isProvideHealthCheckWithMessage` below
 * does the narrowing HealthCheckService.cs's `healthCheck is
 * IProvideHealthCheckWithMessage` C# pattern-match performed.
 *
 * `check()`/`checkWithMessage()` return `HealthCheck | Promise<HealthCheck>`
 * rather than a bare synchronous `HealthCheck` (C#'s signature is fully
 * synchronous): several concrete checks under `checks/` call into
 * `IDownloadClient.getItems()`/`.getStatus()`
 * (`download-clients/IDownloadClient.ts`), which this port's own doc
 * comment documents as `Promise<T> | T` "since this port's QBittorrent
 * client needs a network round trip" -- so a faithful health check wrapping
 * those calls must itself be able to await them. Matches this port's
 * established "interface allows sync or async implementations" convention
 * (see `messaging/events/iHandle.ts`'s doc comment on `HandleAsync`,
 * `messaging/commands/iExecute.ts`'s doc comment on `execute`).
 * `HealthCheckService.performHealthCheck` awaits every result either way.
 */
export interface IProvideHealthCheck {
  check(): HealthCheck | Promise<HealthCheck>;
  readonly checkOnStartup: boolean;
  readonly checkOnSchedule: boolean;
}

export interface IProvideHealthCheckWithMessage extends IProvideHealthCheck {
  checkWithMessage(message: IEvent): HealthCheck | Promise<HealthCheck>;
}

/** Ported from `healthCheck is IProvideHealthCheckWithMessage` in HealthCheckService.PerformHealthCheck. */
export function isProvideHealthCheckWithMessage(
  check: IProvideHealthCheck
): check is IProvideHealthCheckWithMessage {
  return typeof (check as Partial<IProvideHealthCheckWithMessage>).checkWithMessage === "function";
}
