import type { IEventAggregator, IExecute } from "../messaging/index.js";
import { ApplicationShutdownRequested } from "./applicationShutdownRequested.js";
import type { RestartCommand } from "./commands/restartCommand.js";
import type { ShutdownCommand } from "./commands/shutdownCommand.js";

/**
 * Ported from NzbDrone.Common/EnvironmentInfo/IRuntimeInfo.cs's `IsWindowsService`
 * property -- the one member of that interface this service reads. Same
 * narrow forward-reference shape already established by
 * `media-files-import/downloadedBooksImportService.ts`'s `RuntimeInfoLike`
 * for the same C# property; kept as a separate local interface (rather than
 * importing that one) since the two modules are otherwise unrelated and
 * this port's convention is to narrow each cross-module C# dependency to
 * exactly what the importing file needs (see e.g. `download-clients/
 * IDiskProviderLike.ts`'s doc comment on why narrowings aren't shared even
 * when they'd overlap).
 */
export interface RuntimeInfoLike {
  isWindowsService: boolean;
}

/**
 * Ported from the slice of `NzbDrone.Common.IServiceProvider` this service
 * calls: `Stop(string serviceName)` / `Restart(string serviceName)`. The
 * full interface (`ServiceExist`, `Install`, `Uninstall`, `Run`,
 * `GetService`, `Start`, `GetStatus`, `SetPermissions`) is
 * Windows-service-installer machinery entirely out of scope for this
 * module -- narrowed to just what `LifecycleService` calls, same pattern as
 * `RuntimeInfoLike` above.
 */
export interface ServiceControllerLike {
  stop(serviceName: string): void;
  restart(serviceName: string): void;
}

/**
 * Ported from `ServiceProvider.SERVICE_NAME` (NzbDrone.Common/
 * ServiceProvider.cs): `public const string SERVICE_NAME = "Readarr";`.
 * Renamed to this port's app name -- there is no legacy "Readarr" Windows
 * service install to stay compatible with.
 */
export const SERVICE_NAME = "Pagarr";

/** Ported from NzbDrone.Core/Lifecycle/LifecycleService.cs's `ILifecycleService`. */
export interface ILifecycleService {
  shutdown(): void;
  restart(): void;
}

/**
 * Ported from NzbDrone.Core/Lifecycle/LifecycleService.cs.
 *
 * C#: `LifecycleService : ILifecycleService, IExecute<ShutdownCommand>,
 * IExecute<RestartCommand>`, where the two `Execute` overloads are plain
 * one-line delegations to `Shutdown()`/`Restart()`. Uses the real
 * `messaging/` module's `IEventAggregator` (this worktree's task brief
 * calls out Lifecycle as event-driven around app start/stop, and the real
 * EventAggregator now exists to use directly -- unlike `RuntimeInfoLike`/
 * `ServiceControllerLike` above, which forward-reference genuinely
 * unported Common-module interfaces).
 *
 * DEVIATION -- two `IExecute<T>` implementations on one class: C#'s method
 * overloading lets `LifecycleService` declare both `Execute(ShutdownCommand
 * message)` and `Execute(RestartCommand message)` under the same method
 * name, dispatched by the runtime type of `message`. TypeScript classes
 * cannot declare two methods named `execute` with incompatible parameter
 * types. `messaging/commands/commandExecutor.ts`'s `CommandExecutor`
 * (already ported, real) resolves handlers via an explicit `
 * executorRegistry: Map<commandName, IExecute<Command>>` -- one handler
 * *object* per command name, not one class implementing every `IExecute<T>`
 * it needs as same-named overloads -- so this class exposes two distinct
 * `IExecute`-shaped members, `executeShutdown`/`executeRestart`
 * (each a plain `{ execute(message): void }` object), for
 * `CommandExecutor.registerExecutor("Shutdown", service.executeShutdown)` /
 * `registerExecutor("Restart", service.executeRestart)` to register
 * separately -- preserving "both commands route to this same service
 * instance's Shutdown()/Restart()" exactly, just split into two
 * registrable handlers instead of one class satisfying two same-named
 * interface members (which TS structurally cannot express).
 *
 * `Logger _logger` (`_logger.Info("Shutdown requested.")` /
 * `_logger.Info("Restart requested.")`): this port's established
 * "no NLog yet, plain optional callback" convention (see
 * `config/configService.ts`'s doc comment) -- an optional `onInfo`
 * callback stands in.
 */
export class LifecycleService implements ILifecycleService {
  /** `IExecute<ShutdownCommand>` handler object -- see class doc comment on the two-overloads deviation. */
  readonly executeShutdown: IExecute<ShutdownCommand>;
  /** `IExecute<RestartCommand>` handler object -- see class doc comment on the two-overloads deviation. */
  readonly executeRestart: IExecute<RestartCommand>;

  constructor(
    private readonly eventAggregator: IEventAggregator,
    private readonly runtimeInfo: RuntimeInfoLike,
    private readonly serviceProvider: ServiceControllerLike,
    /** Stand-in for NLog `_logger.Info(...)` -- see class doc comment. Defaults to a no-op. */
    private readonly onInfo: (message: string) => void = () => {}
  ) {
    this.executeShutdown = { execute: () => this.shutdown() };
    this.executeRestart = { execute: () => this.restart() };
  }

  shutdown(): void {
    this.onInfo("Shutdown requested.");
    this.eventAggregator.publishEvent(new ApplicationShutdownRequested());

    if (this.runtimeInfo.isWindowsService) {
      this.serviceProvider.stop(SERVICE_NAME);
    }
  }

  restart(): void {
    this.onInfo("Restart requested.");

    this.eventAggregator.publishEvent(new ApplicationShutdownRequested(true));

    if (this.runtimeInfo.isWindowsService) {
      this.serviceProvider.restart(SERVICE_NAME);
    }
  }
}
