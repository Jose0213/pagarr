import type { IProvider, IProviderConfig } from "../thingi-provider/index.js";
import type { Author } from "../books/models.js";
import type { RenamedBookFile } from "../media-files-organize/renamedBookFile.js";
import type { ApplicationUpdateMessage } from "./ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "./AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "./BookDeleteMessage.js";
import type { BookDownloadMessage } from "./BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "./BookFileDeleteMessage.js";
import type { BookRetagMessage } from "./BookRetagMessage.js";
import type { DownloadFailedMessage } from "./DownloadFailedMessage.js";
import type { GrabMessage } from "./GrabMessage.js";
import type { HealthCheckLike } from "./forwardRefs.js";
import type { NotificationDefinition } from "./NotificationDefinition.js";

/**
 * Ported from NzbDrone.Core/Notifications/INotification.cs.
 *
 * `INotification : IProvider` -- unlike the four provider-kind modules that
 * were ported before `thingi-provider/` existed (Indexers/DownloadClients/
 * CustomFormats/Extras, each of which had to inline `IProvider`'s members
 * directly onto their own instance interface, per those files' own
 * "FORWARD-REFERENCE NARROWING" doc comments), `IProvider` is now a REAL
 * ported type at `thingi-provider/IProvider.ts` -- this interface extends it
 * for real, matching the C# `: IProvider` relationship exactly, per this
 * module's task brief ("Notifications' base classes should EXTEND/USE the
 * real ThingiProvider generics faithfully").
 *
 * `definition` is narrowed from `IProvider`'s `ProviderDefinition<TProviderConfig>`
 * to this module's own `NotificationDefinition<TProviderConfig>` (a
 * TypeScript-legal covariant narrowing of a settable property's type via
 * interface extension only works because `NotificationDefinition` itself
 * extends `ProviderDefinition` -- see that file's doc comment), matching
 * C#'s `NotificationBase<TSettings>.Definition` being declared as the base
 * `ProviderDefinition` type but always actually holding a
 * `NotificationDefinition` instance at runtime (the real C# `INotification`
 * doesn't even redeclare `Definition` -- it inherits `IProvider.Definition`
 * as-is, typed `ProviderDefinition`; call sites throughout
 * `NotificationFactory`/`NotificationService` cast it explicitly, e.g.
 * `((NotificationDefinition)notification.Definition).OnGrab` -- see
 * NotificationFactory.cs/NotificationService.cs). This port's stronger
 * typing avoids needing that repeated cast at every call site while
 * preserving the same runtime shape.
 */
export interface INotification<
  TProviderConfig extends IProviderConfig = IProviderConfig,
> extends IProvider<TProviderConfig> {
  definition: NotificationDefinition<TProviderConfig>;

  readonly link: string;

  onGrab(grabMessage: GrabMessage): Promise<void> | void;
  onReleaseImport(message: BookDownloadMessage): Promise<void> | void;
  onRename(author: Author, renamedFiles: RenamedBookFile[]): Promise<void> | void;
  onAuthorAdded(author: Author): Promise<void> | void;
  onAuthorDelete(deleteMessage: AuthorDeleteMessage): Promise<void> | void;
  onBookDelete(deleteMessage: BookDeleteMessage): Promise<void> | void;
  onBookFileDelete(deleteMessage: BookFileDeleteMessage): Promise<void> | void;
  onHealthIssue(healthCheck: HealthCheckLike): Promise<void> | void;
  onApplicationUpdate(updateMessage: ApplicationUpdateMessage): Promise<void> | void;
  onDownloadFailure(message: DownloadFailedMessage): Promise<void> | void;
  onImportFailure(message: BookDownloadMessage): Promise<void> | void;
  onBookRetag(message: BookRetagMessage): Promise<void> | void;
  /**
   * `OnManualInteractionRequired` was NOT found in this worktree's real C#
   * `INotification.cs`/`NotificationBase.cs` snapshot (the task brief's
   * mention of it doesn't match this repo's actual Readarr source revision
   * -- see this module's final report). Omitted rather than invented, per
   * "port faithfully" -- adding a method with no real C# source to port
   * from would be fabrication, not translation. A later Readarr revision
   * that DOES add this method can be ported into this interface then.
   */
  processQueue(): Promise<void> | void;

  readonly supportsOnGrab: boolean;
  readonly supportsOnReleaseImport: boolean;
  readonly supportsOnUpgrade: boolean;
  readonly supportsOnRename: boolean;
  readonly supportsOnAuthorAdded: boolean;
  readonly supportsOnAuthorDelete: boolean;
  readonly supportsOnBookDelete: boolean;
  readonly supportsOnBookFileDelete: boolean;
  readonly supportsOnBookFileDeleteForUpgrade: boolean;
  readonly supportsOnHealthIssue: boolean;
  readonly supportsOnApplicationUpdate: boolean;
  readonly supportsOnDownloadFailure: boolean;
  readonly supportsOnImportFailure: boolean;
  readonly supportsOnBookRetag: boolean;
}
