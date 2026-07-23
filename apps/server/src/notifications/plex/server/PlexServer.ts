import type { Author } from "../../../books/models.js";
import type {
  ValidationFailure,
  ValidationResult,
} from "../../../thingi-provider/IProviderConfig.js";
import { BadRequestException } from "../../../exceptions/BadRequestException.js";
import type { AuthorDeleteMessage } from "../../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../../BookDownloadMessage.js";
import type { BookRetagMessage } from "../../BookRetagMessage.js";
import { NotificationBase } from "../../NotificationBase.js";
import type { RenamedBookFile } from "../../../media-files-organize/renamedBookFile.js";
import type { IPlexTvService } from "../plextv/PlexTvService.js";
import type { PlexTvPinUrlResponse, PlexTvSignInUrlResponse } from "../plextv/PlexTvResponses.js";
import type { IPlexServerService } from "./PlexServerService.js";
import type { PlexServerSettings } from "./PlexServerSettings.js";

/** Minimal logger surface PlexServer needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface PlexServerLogger {
  debug(message: string, ...args: unknown[]): void;
}

/** In-memory pending-authors queue, one per Plex host, matching `_pendingAuthorsCache`'s `PlexUpdateQueue` (Pending dict + Refreshing flag). Ported from PlexServer.cs's private nested class. */
class PlexUpdateQueue {
  readonly pending = new Map<number, Author>();
  refreshing = false;
}

/**
 * Ported from NzbDrone.Core/Notifications/Plex/Server/PlexServer.cs.
 *
 * DEVIATION -- caching: C#'s `ICached<PlexUpdateQueue> _pendingAuthorsCache`
 * (a 1-day rolling cache keyed by `Settings.Host`, from the not-yet-ported
 * `Common.Cache` module) is genuinely load-bearing here -- it's how
 * `ProcessQueue()` batches up authors queued by `OnReleaseImport`/`OnRename`/
 * etc across possibly-many notifier calls before a scheduled job drains them,
 * not just a perf cache. Ported as a plain `Map<host, PlexUpdateQueue>`
 * scoped to this instance (module-level cache managers in C# are
 * process-wide and keyed by type+key; a single `PlexServer` notifier
 * instance is already scoped to one `NotificationDefinition`/settings, i.e.
 * effectively fixed to whichever hosts it's been called with, so an
 * instance-level Map reproduces the same "same host -> same queue" behavior
 * without needing a shared cache manager). No expiry is implemented (C#'s
 * "1 day" rolling TTL just prevents unbounded growth from long-dead hosts) --
 * out of scope for functional correctness.
 *
 * DEVIATION -- locking: C#'s `lock (queue) { ... }` (a `Monitor`-based
 * mutual-exclusion lock guarding concurrent access to `Pending`/`Refreshing`
 * from multiple notifier-invocation threads) has no direct Node equivalent --
 * Node is single-threaded per event loop tick, and every method here that
 * touches `queue.pending`/`queue.refreshing` does so synchronously (no
 * `await` between a read and the following write), so the same
 * interleavings the C# lock prevents cannot occur here. `ProcessQueue`'s
 * `await`s (via `plexServerService.updateLibrary`) are placed OUTSIDE the
 * synchronous pending-drain section that would need locking, matching the
 * C# structure of "grab+clear Pending synchronously under lock, then do the
 * slow network call outside the lock."
 */
export class PlexServer extends NotificationBase<PlexServerSettings> {
  readonly name = "Plex Media Server";
  readonly configContract = "PlexServerSettings";
  readonly link = "https://www.plex.tv/";

  private readonly pendingAuthorsCache = new Map<string, PlexUpdateQueue>();

  constructor(
    private readonly plexServerService: IPlexServerService,
    private readonly plexTvService: IPlexTvService,
    private readonly logger: PlexServerLogger
  ) {
    super();
  }

  override onReleaseImport(message: BookDownloadMessage): void {
    if (message.author) {
      this.updateIfEnabled(message.author);
    }
  }

  override onRename(author: Author, _renamedFiles: RenamedBookFile[]): void {
    this.updateIfEnabled(author);
  }

  override onBookRetag(message: BookRetagMessage): void {
    if (message.author) {
      this.updateIfEnabled(message.author);
    }
  }

  override onBookDelete(deleteMessage: BookDeleteMessage): void {
    if (deleteMessage.deletedFiles) {
      const author = deleteMessage.book?.author;
      if (author) {
        this.updateIfEnabled(author);
      }
    }
  }

  override onAuthorDelete(deleteMessage: AuthorDeleteMessage): void {
    if (deleteMessage.deletedFiles) {
      this.updateIfEnabled(deleteMessage.author);
    }
  }

  private updateIfEnabled(author: Author): void {
    // Ported as fire-and-forget (matching the C# `void` method calling
    // `_plexTvService.Ping` synchronously) -- see this class's doc comment
    // on why the queue mutation right below stays synchronous.
    void this.plexTvService.ping(this.settings.authToken);

    if (this.settings.updateLibrary) {
      this.logger.debug(
        "Scheduling library update for author %d %s",
        author.id,
        author.metadata?.name
      );

      let queue = this.pendingAuthorsCache.get(this.settings.host);
      if (!queue) {
        queue = new PlexUpdateQueue();
        this.pendingAuthorsCache.set(this.settings.host, queue);
      }

      queue.pending.set(author.id, author);
    }
  }

  override async processQueue(): Promise<void> {
    const queue = this.pendingAuthorsCache.get(this.settings.host);

    if (!queue) {
      return;
    }

    if (queue.refreshing) {
      return;
    }

    queue.refreshing = true;

    try {
      for (;;) {
        if (queue.pending.size === 0) {
          queue.refreshing = false;
          return;
        }

        const refreshingAuthors = [...queue.pending.values()];
        queue.pending.clear();

        if (this.settings.updateLibrary) {
          this.logger.debug("Performing library update for %d authors", refreshingAuthors.length);
          await this.plexServerService.updateLibraryForAuthors(refreshingAuthors, this.settings);
        }
      }
    } catch (ex) {
      queue.refreshing = false;
      throw ex;
    }
  }

  async test(): Promise<ValidationResult> {
    await this.plexTvService.ping(this.settings.authToken);

    const failures: ValidationFailure[] = [];

    const failure = await this.plexServerService.test(this.settings);
    if (failure) {
      failures.push(failure);
    }

    return {
      isValid: !failures.some((f) => !f.isWarning),
      hasWarnings: failures.some((f) => !!f.isWarning),
      errors: failures,
    };
  }

  /**
   * Ported from `PlexServer.RequestAction`. C#'s `object RequestAction(...)`
   * is synchronous (its `IHttpClient`/`IPlexTvService` calls block); this
   * port's HTTP layer is async throughout, so `requestAction` here returns
   * `Promise<unknown>` -- still a valid narrowing of the base
   * `INotification.requestAction`'s `unknown` return type (see
   * `notifications/forwardRefs.ts`), just resolved by the caller with
   * `await` instead of being available synchronously.
   */
  override async requestAction(
    action: string,
    query: Record<string, string>
  ): Promise<
    | PlexTvPinUrlResponse
    | PlexTvSignInUrlResponse
    | { authToken: string | null }
    | Record<string, never>
  > {
    if (action === "startOAuth") {
      this.throwOnInvalidOAuthSettings();
      return this.plexTvService.getPinUrl();
    } else if (action === "continueOAuth") {
      this.throwOnInvalidOAuthSettings();

      if (!query.callbackUrl || query.callbackUrl.trim() === "") {
        throw new BadRequestException("QueryParam callbackUrl invalid.");
      }

      if (!query.id || query.id.trim() === "") {
        throw new BadRequestException("QueryParam id invalid.");
      }

      if (!query.code || query.code.trim() === "") {
        throw new BadRequestException("QueryParam code invalid.");
      }

      return this.plexTvService.getSignInUrl(query.callbackUrl, Number(query.id), query.code);
    } else if (action === "getOAuthToken") {
      this.throwOnInvalidOAuthSettings();

      if (!query.pinId || query.pinId.trim() === "") {
        throw new BadRequestException("QueryParam pinId invalid.");
      }

      const authToken = await this.plexTvService.getAuthToken(Number(query.pinId));
      return { authToken };
    }

    return {};
  }

  /** Ported from `Settings.Validate().Filter("ConsumerKey", "ConsumerSecret").ThrowOnError()` -- see this method's call sites for context. NB: the real C# filters on "ConsumerKey"/"ConsumerSecret" property names, which don't exist on PlexServerSettings at all (a copy-paste artifact from another OAuth-based notifier) -- preserved faithfully: since PlexServerSettings.Validate() never produces failures under those property names, the Filter() is a no-op and ThrowOnError() never fires from this filtered set. Full settings validation still runs (unfiltered failures are just discarded here, matching Filter()'s behavior), it just never throws. */
  private throwOnInvalidOAuthSettings(): void {
    const result = this.settings.validate();
    const filtered = result.errors.filter(
      (e) => e.propertyName === "ConsumerKey" || e.propertyName === "ConsumerSecret"
    );

    if (filtered.some((e) => !e.isWarning)) {
      throw new BadRequestException(filtered.map((e) => e.errorMessage).join(", "));
    }
  }
}
