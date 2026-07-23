import type { IProviderConfig } from "../thingi-provider/IProviderConfig.js";
import type { ValidationResult } from "../thingi-provider/IProviderConfig.js";
import type { ProviderDefinition } from "../thingi-provider/ProviderDefinition.js";
import type { ProviderMessage } from "../thingi-provider/ProviderMessage.js";
import type { Author } from "../books/models.js";
import type { RenamedBookFile } from "../media-files-organize/renamedBookFile.js";
import type { INotification } from "./INotification.js";
import type { NotificationDefinition } from "./NotificationDefinition.js";
import type { ApplicationUpdateMessage } from "./ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "./AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "./BookDeleteMessage.js";
import type { BookDownloadMessage } from "./BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "./BookFileDeleteMessage.js";
import type { BookRetagMessage } from "./BookRetagMessage.js";
import type { DownloadFailedMessage } from "./DownloadFailedMessage.js";
import type { GrabMessage } from "./GrabMessage.js";
import type { HealthCheckLike } from "./forwardRefs.js";

/**
 * Ported from NzbDrone.Core/Notifications/NotificationBase.cs.
 *
 * ## The reflection problem and how this port adapts it
 *
 * C#'s `SupportsOnX` properties are all computed via
 * `HasConcreteImplementation(methodName)`: a reflection call
 * (`GetType().GetMethod(methodName).DeclaringType.IsAbstract`) that checks
 * whether the *runtime* subclass overrode the named virtual `OnX` method, or
 * left the base class's own no-op `protected virtual void OnX(...) { }`
 * implementation in place. TypeScript/JS has no `DeclaringType` reflection
 * equivalent, but it DOES have a real, structurally-equivalent substitute:
 * every subclass method lives on that subclass's own prototype object, and
 * an *unoverridden* method is inherited straight from `NotificationBase
 * .prototype` -- so `Object.getPrototypeOf(this)[methodName] ===
 * NotificationBase.prototype[methodName]` is true if and only if the
 * subclass did NOT override it, exactly mirroring
 * `DeclaringType.IsAbstract` (true = still the base's own declaration).
 * `hasConcreteImplementation()` below implements that check.
 *
 * `MissingMethodException` (thrown when `GetMethod(methodName)` finds no
 * method at all) has no equivalent failure mode here -- every `OnX` method
 * is a real, always-present method on this TS base class (unlike C#, where
 * `GetMethod` could theoretically fail for a name typo), so that branch is
 * omitted rather than faked.
 */
export abstract class NotificationBase<
  TSettings extends IProviderConfig,
> implements INotification<TSettings> {
  protected static readonly BOOK_GRABBED_TITLE = "Book Grabbed";
  protected static readonly BOOK_DOWNLOADED_TITLE = "Book Downloaded";
  protected static readonly AUTHOR_ADDED_TITLE = "Author Added";
  protected static readonly AUTHOR_DELETED_TITLE = "Author Deleted";
  protected static readonly BOOK_DELETED_TITLE = "Book Deleted";
  protected static readonly BOOK_FILE_DELETED_TITLE = "Book File Deleted";
  protected static readonly HEALTH_ISSUE_TITLE = "Health Check Failure";
  protected static readonly DOWNLOAD_FAILURE_TITLE = "Download Failed";
  protected static readonly IMPORT_FAILURE_TITLE = "Import Failed";
  protected static readonly BOOK_RETAGGED_TITLE = "Book File Tags Updated";
  protected static readonly APPLICATION_UPDATE_TITLE = "Application Updated";

  protected static readonly BOOK_GRABBED_TITLE_BRANDED =
    "Readarr - " + NotificationBase.BOOK_GRABBED_TITLE;
  protected static readonly BOOK_DOWNLOADED_TITLE_BRANDED =
    "Readarr - " + NotificationBase.BOOK_DOWNLOADED_TITLE;
  protected static readonly AUTHOR_ADDED_TITLE_BRANDED =
    "Readarr - " + NotificationBase.AUTHOR_ADDED_TITLE;
  protected static readonly AUTHOR_DELETED_TITlE_BRANDED =
    "Readarr - " + NotificationBase.AUTHOR_DELETED_TITLE;
  protected static readonly BOOK_DELETED_TITLE_BRANDED =
    "Readarr - " + NotificationBase.BOOK_DELETED_TITLE;
  protected static readonly BOOK_FILE_DELETED_TITLE_BRANDED =
    "Readarr - " + NotificationBase.BOOK_FILE_DELETED_TITLE;
  protected static readonly HEALTH_ISSUE_TITLE_BRANDED =
    "Readarr - " + NotificationBase.HEALTH_ISSUE_TITLE;
  protected static readonly DOWNLOAD_FAILURE_TITLE_BRANDED =
    "Readarr - " + NotificationBase.DOWNLOAD_FAILURE_TITLE;
  protected static readonly IMPORT_FAILURE_TITLE_BRANDED =
    "Readarr - " + NotificationBase.IMPORT_FAILURE_TITLE;
  protected static readonly BOOK_RETAGGED_TITLE_BRANDED =
    "Readarr - " + NotificationBase.BOOK_RETAGGED_TITLE;
  protected static readonly APPLICATION_UPDATE_TITLE_BRANDED =
    "Readarr - " + NotificationBase.APPLICATION_UPDATE_TITLE;

  abstract readonly name: string;
  abstract readonly configContract: string;
  abstract readonly link: string;

  /** Ported from `NotificationBase<TSettings>.Message => null` (virtual, base returns null). */
  get message(): ProviderMessage | null {
    return null;
  }

  /** Ported from `NotificationBase<TSettings>.DefaultDefinitions => new List<ProviderDefinition>()`. */
  get defaultDefinitions(): ProviderDefinition<TSettings>[] {
    return [];
  }

  /** Ported from NotificationBase.Definition (settable, matches C#'s `ProviderDefinition Definition { get; set; }`). */
  definition!: NotificationDefinition<TSettings>;

  abstract test(): Promise<ValidationResult>;

  /** Ported from `NotificationBase<TSettings>.OnGrab` (virtual no-op). */
  onGrab(_grabMessage: GrabMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnReleaseImport` (virtual no-op). */
  onReleaseImport(_message: BookDownloadMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnRename` (virtual no-op). */
  onRename(_author: Author, _renamedFiles: RenamedBookFile[]): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnAuthorAdded` (virtual no-op). */
  onAuthorAdded(_author: Author): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnAuthorDelete` (virtual no-op). */
  onAuthorDelete(_deleteMessage: AuthorDeleteMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnBookDelete` (virtual no-op). */
  onBookDelete(_deleteMessage: BookDeleteMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnBookFileDelete` (virtual no-op). */
  onBookFileDelete(_deleteMessage: BookFileDeleteMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnHealthIssue` (virtual no-op). */
  onHealthIssue(_healthCheck: HealthCheckLike): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnDownloadFailure` (virtual no-op). */
  onDownloadFailure(_message: DownloadFailedMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnImportFailure` (virtual no-op). */
  onImportFailure(_message: BookDownloadMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnBookRetag` (virtual no-op). */
  onBookRetag(_message: BookRetagMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.OnApplicationUpdate` (virtual no-op). */
  onApplicationUpdate(_updateMessage: ApplicationUpdateMessage): Promise<void> | void {}

  /** Ported from `NotificationBase<TSettings>.ProcessQueue` (virtual no-op). */
  processQueue(): Promise<void> | void {}

  /**
   * Ported from `HasConcreteImplementation(methodName)` checks -- see this
   * class's doc comment for the prototype-identity substitute used in place
   * of C# reflection.
   */
  get supportsOnGrab(): boolean {
    return this.hasConcreteImplementation("onGrab");
  }

  get supportsOnRename(): boolean {
    return this.hasConcreteImplementation("onRename");
  }

  get supportsOnAuthorAdded(): boolean {
    return this.hasConcreteImplementation("onAuthorAdded");
  }

  get supportsOnAuthorDelete(): boolean {
    return this.hasConcreteImplementation("onAuthorDelete");
  }

  get supportsOnBookDelete(): boolean {
    return this.hasConcreteImplementation("onBookDelete");
  }

  get supportsOnBookFileDelete(): boolean {
    return this.hasConcreteImplementation("onBookFileDelete");
  }

  /** Ported from `SupportsOnBookFileDeleteForUpgrade => SupportsOnBookFileDelete`. */
  get supportsOnBookFileDeleteForUpgrade(): boolean {
    return this.supportsOnBookFileDelete;
  }

  get supportsOnReleaseImport(): boolean {
    return this.hasConcreteImplementation("onReleaseImport");
  }

  /** Ported from `SupportsOnUpgrade => SupportsOnReleaseImport`. */
  get supportsOnUpgrade(): boolean {
    return this.supportsOnReleaseImport;
  }

  get supportsOnHealthIssue(): boolean {
    return this.hasConcreteImplementation("onHealthIssue");
  }

  get supportsOnDownloadFailure(): boolean {
    return this.hasConcreteImplementation("onDownloadFailure");
  }

  get supportsOnImportFailure(): boolean {
    return this.hasConcreteImplementation("onImportFailure");
  }

  get supportsOnBookRetag(): boolean {
    return this.hasConcreteImplementation("onBookRetag");
  }

  get supportsOnApplicationUpdate(): boolean {
    return this.hasConcreteImplementation("onApplicationUpdate");
  }

  protected get settings(): TSettings {
    return this.definition.settings as TSettings;
  }

  /** Ported from `NotificationBase<TSettings>.ToString() => GetType().Name`. */
  toString(): string {
    return this.constructor.name;
  }

  /** Ported from `NotificationBase<TSettings>.RequestAction` (virtual, base returns null). */
  requestAction(_action: string, _query: Record<string, string>): unknown {
    return null;
  }

  /**
   * Ported from `NotificationBase<TSettings>.HasConcreteImplementation(string
   * methodName)`. See this class's doc comment for the full rationale: a
   * method is "concrete" (overridden by a real subclass) exactly when the
   * subclass's own prototype chain resolves it to something other than
   * `NotificationBase.prototype`'s own declaration -- the structural
   * equivalent of C#'s `DeclaringType.IsAbstract` check.
   */
  private hasConcreteImplementation(methodName: keyof NotificationBase<TSettings>): boolean {
    const ownImplementation = (NotificationBase.prototype as unknown as Record<string, unknown>)[
      methodName as string
    ];
    const actualImplementation = (this as unknown as Record<string, unknown>)[methodName as string];

    return actualImplementation !== ownImplementation;
  }
}
