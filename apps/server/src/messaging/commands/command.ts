import { CommandTrigger } from "./commandTrigger.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/Command.cs.
 *
 * C#'s `Command` is an abstract base class with virtual properties that
 * concrete commands override (`SendUpdatesToClient`, `UpdateScheduledTask`,
 * `CompletionMessage`, `RequiresDiskAccess`, `IsExclusive`,
 * `IsTypeExclusive`, `IsLongRunning`) plus scheduler bookkeeping fields
 * (`Name`, `LastExecutionTime`, `LastStartTime`, `Trigger`,
 * `SuppressMessages`, `ClientUserAgent`) common to every command instance.
 * `Name` is computed once in the constructor from the runtime type name
 * with "Command" stripped (e.g. `RssSyncCommand` -> `"RssSync"`) --
 * ported the same way, computed from `new.target.name` (the actual
 * subclass constructor name at `new` time, mirroring C#'s
 * `GetType().Name`) rather than hardcoded per subclass.
 *
 * `[JsonConverter(typeof(PolymorphicWriteOnlyJsonConverter<Command>))]`
 * (custom polymorphic serialization for the API layer) has no port here --
 * no HTTP/API layer exists yet in this module's scope; a future API-layer
 * port can add JSON (de)serialization keyed off `Name`/constructor without
 * changing this class.
 *
 * Downstream modules that already reference "the Messaging module's
 * Command shape" as a plain marker class with just `requiresDiskAccess`/
 * `isLongRunning` flags (e.g. `download-tracking/commands.ts`'s
 * `ProcessMonitoredDownloadsCommand`) predate this port and don't extend
 * this real base -- reconciling them to actually `extends Command` is part
 * of the human's cross-module reconciliation pass (see this module's final
 * report), not done here per task constraints (this worktree only owns
 * `messaging/` and `queue/`).
 */
export abstract class Command {
  /** Backing field for `sendUpdatesToClient` below -- ported from the C# source's private `_sendUpdatesToClient` field. */
  private _sendUpdatesToClient = false;

  /**
   * Ported from `virtual bool SendUpdatesToClient { get; set; }` -- unlike
   * the other virtual properties, C# allows this one to be *set*, not just
   * overridden; a subclass can override the getter/setter pair (see
   * `testCommand.ts`/`unknownCommand.ts`'s get-only overrides), or a
   * caller can flip the instance value at runtime (e.g. via the API
   * layer). Ported as a getter/setter pair over a private backing field
   * (rather than a plain public field) specifically so subclasses can
   * override it as a get-only accessor the same shape as C#'s `override
   * bool SendUpdatesToClient => true;` -- a plain field can't be
   * "overridden" with a getter-only accessor in a derived class the way a
   * base accessor pair can.
   */
  get sendUpdatesToClient(): boolean {
    return this._sendUpdatesToClient;
  }

  set sendUpdatesToClient(value: boolean) {
    this._sendUpdatesToClient = value;
  }

  /** Ported from `virtual bool UpdateScheduledTask => true;`. */
  get updateScheduledTask(): boolean {
    return true;
  }

  /** Ported from `virtual string CompletionMessage => null;`. */
  get completionMessage(): string | null {
    return null;
  }

  /** Ported from `virtual bool RequiresDiskAccess => false;`. */
  get requiresDiskAccess(): boolean {
    return false;
  }

  /** Ported from `virtual bool IsExclusive => false;`. */
  get isExclusive(): boolean {
    return false;
  }

  /** Ported from `virtual bool IsTypeExclusive => false;`. */
  get isTypeExclusive(): boolean {
    return false;
  }

  /** Ported from `virtual bool IsLongRunning => false;`. */
  get isLongRunning(): boolean {
    return false;
  }

  /** Ported from `public string Name { get; private set; }`, computed in the constructor from the runtime type name. */
  readonly name: string;

  lastExecutionTime: string | null = null;
  lastStartTime: string | null = null;
  trigger: CommandTrigger = CommandTrigger.Unspecified;
  suppressMessages = false;
  clientUserAgent: string | null = null;

  constructor() {
    // Ported from `Name = GetType().Name.Replace("Command", "");` -- uses
    // `new.target`, the actual subclass constructor invoked (not `Command`
    // itself), matching C#'s `GetType()` runtime-type semantics under
    // `abstract class Command`. `.replace(/Command/g, "")` matches C#'s
    // `string.Replace` (replaces every occurrence, not just a trailing
    // one) -- faithful even though in practice every real command name
    // ends with exactly one "Command" substring.
    const ctorName = new.target.name;
    this.name = ctorName.replace(/Command/g, "");
  }
}
