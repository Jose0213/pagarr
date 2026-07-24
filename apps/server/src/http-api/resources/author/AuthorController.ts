import type { Router } from "express";
import {
  AuthorAddedEvent,
  AuthorDeletedEvent,
  AuthorEditedEvent,
  AuthorUpdatedEvent,
  BookEditedEvent,
  type Author,
  type AuthorService,
  type BookService,
} from "../../../books/index.js";
import type { AuthorStatisticsService } from "../../../author-stats/index.js";
import { ModelAction } from "../../../db/events.js";
import { MediaCoverEntity, type IMapCoversToLocal } from "../../../media-cover/index.js";
import { CommandPriority } from "../../../messaging/commands/commandPriority.js";
import { CommandTrigger } from "../../../messaging/commands/commandTrigger.js";
import type { IManageCommandQueue } from "../../../messaging/commands/commandQueueManager.js";
import type { EventAggregator } from "../../../messaging/events/eventAggregator.js";
import type { SignalRBroadcaster } from "../../signalr/SignalRBroadcaster.js";
import type { IRootFolderService } from "../../../root-folders/root-folder-service.js";
import {
  isValidQualityProfileId,
  isValidMetadataProfileId,
  type IdExistenceCheck,
} from "../../../validation/entityExistsValidators.js";
import {
  isValidFolderPath,
  isNotAncestorOfExistingAuthor,
  isNewAuthor,
  isNotAnotherAuthorsPath,
  isNotExistingRootFolderPath,
} from "../../../validation/index.js";
import {
  validateAgainstRecycleBin,
  validateAgainstSystemFolders,
} from "../../../validation/paths/systemFolderValidators.js";
import { isNotMappedNetworkDriveUnderWindowsService } from "../../../validation/paths/mappedNetworkDriveValidator.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import { restControllerWithSignalR } from "../../rest/RestControllerWithSignalR.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import { NotFoundException } from "../../rest/NotFoundException.js";
import {
  authorResourceToModel,
  authorResourceToModelMerge,
  authorToResource,
  type AuthorResource,
} from "./AuthorResource.js";
import { isValidAuthorFolderAsRootFolder } from "./AuthorFolderAsRootFolderValidator.js";
import { MoveAuthorCommand } from "./authorCommands.js";

/**
 * Ported from Readarr.Api.V1/Author/AuthorController.cs.
 *
 * ## `IAddAuthorService` -- forward-ref, no port exists yet
 *
 * `IAddAuthorService`/`AddAuthorService` (`NzbDrone.Core/Books/Services/
 * AddAuthorService.cs`) is explicitly out of scope of the already-merged
 * `books/` module (see `books/index.ts`'s doc comment listing it alongside
 * `AddBookService`/`BookCutoffService`/`MoveAuthorService` as deferred).
 * This controller's `POST /` (`AddAuthor`) has no other real dependency to
 * build an author from a resource and persist it, so a narrow
 * `IAddAuthorServiceLike` interface (just the one method this controller
 * calls, `addAuthor(author) => Author`, matching the real
 * `AddAuthorService.AddAuthor(Author newAuthor)` signature) is declared
 * locally below and REQUIRED as a constructor-style option -- this is a
 * genuine forward-ref a caller must supply once the real service lands.
 *
 * ## `MoveAuthorCommand`/`BulkMoveAuthorCommand` -- forward-ref, defined locally
 *
 * See `authorCommands.ts`'s module doc comment: `NzbDrone.Core.Books.
 * Commands` has no ported home yet either, so this file imports the two
 * small `Command` subclasses declared locally in this same directory.
 *
 * ## Route/mount-path convention
 *
 * `[V1ApiController]` with no explicit resource name defaults to
 * `[controller]` (the class name minus "Controller", lowercased by ASP.NET's
 * route-token convention) -- `AuthorController` -> `/api/v1/author`. This
 * factory returns just the `Router`; the mount path itself is the caller's
 * concern (`app.mountResource("/api/v1/author", authorController(...).router)`),
 * matching every other Phase 5 resource router in this codebase (see
 * RestController.ts's own module doc comment -- no controller here owns its
 * own mount path).
 *
 * ## SignalR event wiring (IHandle<T> -> explicit EventAggregator subscriptions)
 *
 * The real C# class implements NINE `IHandle<T>` interfaces
 * (`BookImportedEvent`, `BookEditedEvent`, `BookFileDeletedEvent`,
 * `AuthorAddedEvent`, `AuthorUpdatedEvent`, `AuthorEditedEvent`,
 * `AuthorDeletedEvent`, `AuthorRenamedEvent`, `MediaCoversUpdatedEvent`),
 * each broadcasting an updated (or deleted) `AuthorResource` over SignalR.
 * `restControllerWithSignalR()` already wires up ONE of these
 * (`ModelEvent<Author>` -> Updated/Deleted broadcasts, matching the base
 * `RestControllerWithSignalR<TResource, TModel>.Handle(ModelEvent<TModel>)`
 * every concrete controller inherits) -- see that file's doc comment. The
 * other eight `Handle(...)` overloads are controller-SPECIFIC additions on
 * top of that base (C#'s multiple-interface-implementation is how
 * `AuthorController` layers its own extra event subscriptions onto the
 * inherited one). This port exposes those eight as named `handleXxx`
 * functions returned alongside the router (`AuthorControllerHandlers`)
 * rather than auto-subscribing them internally, matching this codebase's
 * established "explicit subscription over reflection-discovered IHandle<T>"
 * convention (see `books/events.ts`'s module doc comment) -- a caller
 * wiring up the real, shared `EventAggregator` instance across every
 * ported module subscribes each handler once at composition-root time
 * (`eventAggregator.subscribe(BookImportedEvent, { handle: handlers.handleBookImported })`,
 * etc.), the same shape `AuthorStatisticsService`'s `handleXxx` methods
 * already establish for this exact situation (see that file's doc comment).
 * Only the base ModelEvent<Author> subscription (Updated/Deleted on direct
 * CRUD through this controller's own five REST routes) is wired
 * automatically by `restControllerWithSignalR` itself, since that one IS
 * `RestController`'s inherited behavior, not an extra opt-in interface.
 *
 * `BookImportedEvent`/`AuthorRenamedEvent` (`NzbDrone.Core.MediaFiles.Events.
 * BookImportedEvent` / `NzbDrone.Core.Books.Events.AuthorRenamedEvent`) have
 * no ported home anywhere in this codebase yet (the same forward-ref gap
 * `author-stats/authorStatisticsService.ts` already documents for its own
 * `handleBookImported`, and `books/events.ts`'s union has no
 * `AuthorRenamedEvent` member) -- both handled here via narrow `*Like`
 * forward-ref interfaces declaring only the fields this controller's own
 * `Handle` methods actually read. `BookFileDeletedEvent` IS real and ported
 * (`media-files-import/events.ts`) so `handleBookFileDeleted` below takes
 * that real type. `MediaCoversUpdatedEvent` is `media-cover/
 * mediaCoversUpdatedEvent.ts`, also real and ported.
 */

export interface IAddAuthorServiceLike {
  /** Ported from `IAddAuthorService.AddAuthor(Author newAuthor)`. See module doc comment's forward-ref note. */
  addAuthor(author: Author): Author;
}

/** Narrow forward-ref for `NzbDrone.Core.MediaFiles.Events.BookImportedEvent` -- see module doc comment. Only the one field this controller's `Handle` reads (`.Author`) is declared. */
export interface BookImportedEventLike {
  author: Author;
}

/** Narrow forward-ref for `NzbDrone.Core.Books.Events.AuthorRenamedEvent` -- see module doc comment. Only the one field this controller's `Handle` reads (`.Author.Id`) is declared. */
export interface AuthorRenamedEventLike {
  author: Pick<Author, "id">;
}

/** Narrow shape this controller's `Handle(BookFileDeletedEvent)` reads off the real, already-ported `media-files-import/events.ts` `BookFileDeletedEvent` -- declared narrowly here (matching this port's established `Pick`-style narrowing convention) rather than importing that module directly, since this worktree has no other dependency on media-files-import. */
export interface BookFileDeletedEventLike {
  reason: string;
  bookFile: { author?: Author };
}

/** Narrow shape this controller's `Handle(MediaCoversUpdatedEvent)` reads. */
export interface MediaCoversUpdatedEventLike {
  author: Author;
}

export interface AuthorControllerOptions {
  authorService: AuthorService;
  bookService: BookService;
  addAuthorService: IAddAuthorServiceLike;
  authorStatisticsService: AuthorStatisticsService;
  coverMapper: IMapCoversToLocal;
  commandQueueManager: IManageCommandQueue;
  rootFolderService: IRootFolderService;
  eventAggregator: EventAggregator;
  signalRBroadcaster: SignalRBroadcaster;
  qualityProfileService: IdExistenceCheck;
  metadataProfileService: IdExistenceCheck;
  /** Ported from the ctor's `AuthorFolderAsRootFolderValidator` dependency -- see AuthorFolderAsRootFolderValidator.ts. Optional: a caller that hasn't wired up the Organizer module's `FileNameBuilder` yet may omit it, in which case that one PostValidator rule is skipped entirely rather than throwing (a narrower fidelity gap than blocking this whole controller on Organizer wiring). */
  getAuthorFolder?: (author: Author | null) => string;
  /** Ported from `RuntimeInfoLike`/`MountLookup`-driven `MappedNetworkDriveValidator` deps -- optional; when omitted, that validator rule is skipped (matches "not running as a Windows service" always being valid, the common case for this port's target deployment). */
  mappedNetworkDriveCheck?: {
    isWindows: boolean;
    runtimeInfo: { isWindowsService: boolean };
    diskProvider: {
      getMount: (
        path: string
      ) => { driveType: "network" | "fixed" | "removable" | "unknown" } | null | undefined;
    };
  };
  /** Ported from `RecycleBinValidator`'s configured recycle-bin path dependency (`IConfigService.RecycleBin`) -- optional; omitted skips that rule (empty/unset recycle bin is itself a no-op per `validateAgainstRecycleBin`'s own contract). */
  recycleBinPath?: string | null;
}

export interface AuthorControllerHandlers {
  /** Ported from `Handle(BookImportedEvent message)`. See module doc comment's BookImportedEvent forward-ref note. */
  handleBookImported(message: BookImportedEventLike): void;
  /** Ported from `Handle(BookEditedEvent message)`. */
  handleBookEdited(message: BookEditedEvent): void;
  /** Ported from `Handle(BookFileDeletedEvent message)`: skipped entirely when `message.reason === "Upgrade"` (matches the real C# `if (message.Reason == DeleteMediaFileReason.Upgrade) { return; }`). */
  handleBookFileDeleted(message: BookFileDeletedEventLike): void;
  /** Ported from `Handle(AuthorAddedEvent message)`. */
  handleAuthorAdded(message: AuthorAddedEvent): void;
  /** Ported from `Handle(AuthorUpdatedEvent message)`. */
  handleAuthorUpdated(message: AuthorUpdatedEvent): void;
  /** Ported from `Handle(AuthorEditedEvent message)`. */
  handleAuthorEdited(message: AuthorEditedEvent): void;
  /** Ported from `Handle(AuthorDeletedEvent message)`: broadcasts the bare `author.ToResource()` (no stats/covers/next-book linking -- matches the real C# `Handle`, which calls `message.Author.ToResource()` directly rather than the private `GetAuthorResource` helper every other handler uses). */
  handleAuthorDeleted(message: AuthorDeletedEvent): void;
  /** Ported from `Handle(AuthorRenamedEvent message)`: broadcasts by id only (`BroadcastResourceChange(ModelAction.Updated, message.Author.Id)` -- the id-only overload, distinct from every other handler here which broadcasts a full resource). See module doc comment's AuthorRenamedEvent forward-ref note. */
  handleAuthorRenamed(message: AuthorRenamedEventLike): void;
  /** Ported from `Handle(MediaCoversUpdatedEvent message)`. */
  handleMediaCoversUpdated(message: MediaCoversUpdatedEventLike): void;
}

export interface AuthorControllerResult {
  router: Router;
  handlers: AuthorControllerHandlers;
  /** Unsubscribes the base `ModelEvent<Author>` SignalR subscription -- see RestControllerWithSignalR.ts's `unsubscribe` return value. */
  unsubscribe: () => void;
}

const AUTHOR_RESOURCE_NAME = "author";

export function authorController(options: AuthorControllerOptions): AuthorControllerResult {
  const {
    authorService,
    bookService,
    addAuthorService,
    authorStatisticsService,
    coverMapper,
    commandQueueManager,
    rootFolderService,
    eventAggregator,
    signalRBroadcaster,
    qualityProfileService,
    metadataProfileService,
    getAuthorFolder,
    mappedNetworkDriveCheck,
    recycleBinPath,
  } = options;

  // ---- MapCoversToLocal / LinkNextPreviousBooks / stats / root folder ----
  // Ported from AuthorController's private helper methods of the same name.

  function mapCoversToLocal(...authors: AuthorResource[]): void {
    for (const resource of authors) {
      coverMapper.convertToLocalUrls(resource.id, MediaCoverEntity.Author, resource.images);
    }
  }

  function linkNextPreviousBooks(...authors: AuthorResource[]): void {
    const metadataIds = authors.map((a) => a.authorMetadataId);
    const nextBooks = bookService.getNextBooksByAuthorMetadataId(metadataIds);
    const lastBooks = bookService.getLastBooksByAuthorMetadataId(metadataIds);

    for (const resource of authors) {
      resource.nextBook =
        nextBooks.find((b) => b.authorMetadataId === resource.authorMetadataId) ?? null;
      resource.lastBook =
        lastBooks.find((b) => b.authorMetadataId === resource.authorMetadataId) ?? null;
    }
  }

  /** Ported from `AuthorStatisticsResourceMapper.ToResource`'s percentOfBooks computation, applied at link time -- see AuthorStatisticsResource.ts. */
  function statsToResource(stats: {
    bookFileCount: number;
    bookCount: number;
    availableBookCount: number;
    totalBookCount: number;
    sizeOnDisk: number;
  }): AuthorResource["statistics"] {
    return {
      bookFileCount: stats.bookFileCount,
      bookCount: stats.bookCount,
      availableBookCount: stats.availableBookCount,
      totalBookCount: stats.totalBookCount,
      sizeOnDisk: stats.sizeOnDisk,
      percentOfBooks:
        stats.bookCount === 0 ? 0 : (stats.availableBookCount / stats.bookCount) * 100,
    };
  }

  function fetchAndLinkAuthorStatistics(resource: AuthorResource): void {
    resource.statistics = statsToResource(
      authorStatisticsService.authorStatisticsByAuthor(resource.id)
    );
  }

  function linkAuthorStatisticsBulk(resources: AuthorResource[]): void {
    const all = authorStatisticsService.authorStatistics();
    const byAuthorId = new Map(all.map((s) => [s.authorId, s]));

    for (const resource of resources) {
      const stats = byAuthorId.get(resource.id);
      if (stats) {
        resource.statistics = statsToResource(stats);
      }
    }
  }

  function linkRootFolderPath(...authors: AuthorResource[]): void {
    const rootFolders = rootFolderService.all();
    for (const resource of authors) {
      resource.rootFolderPath = rootFolderService.getBestRootFolderPath(resource.path, rootFolders);
    }
  }

  /** Ported from `GetAuthorResource(NzbDrone.Core.Books.Author author)`. */
  function getAuthorResource(author: Author | null | undefined): AuthorResource | null {
    const resource = authorToResource(author);
    if (resource === null) {
      return null;
    }

    mapCoversToLocal(resource);
    fetchAndLinkAuthorStatistics(resource);
    linkNextPreviousBooks(resource);
    linkRootFolderPath(resource);

    return resource;
  }

  /** Ported from `GetResourceById(int id)`. */
  function getResourceById(id: number): AuthorResource {
    const author = authorService.getAuthor(id);
    const resource = getAuthorResource(author);
    if (resource === null) {
      // Unreachable in practice -- authorService.getAuthor throws
      // ModelNotFoundException (-> 404) before this point on a missing id,
      // matching GetResourceByIdWithErrorHandler's real behavior. Kept as
      // an explicit guard rather than a non-null assertion for clarity.
      throw new NotFoundException();
    }
    return resource;
  }

  // ---- Validators (ported from the ctor body's SharedValidator/PostValidator/PutValidator rules) ----

  const sharedValidator: ResourceValidator<AuthorResource> = (resource) => {
    const failures: ValidationFailure[] = [];

    // Ported: RuleBuilderExtensions.ValidId on QualityProfileId/MetadataProfileId.
    if (!Number.isInteger(resource.qualityProfileId) || resource.qualityProfileId <= 0) {
      failures.push({
        propertyName: "qualityProfileId",
        errorMessage: "'Quality Profile Id' must be a valid id",
      });
    }
    if (!Number.isInteger(resource.metadataProfileId) || resource.metadataProfileId <= 0) {
      failures.push({
        propertyName: "metadataProfileId",
        errorMessage: "'Metadata Profile Id' must be a valid id",
      });
    }

    // Ported: RuleFor(s => s.Path).Cascade(Stop).IsValidPath().SetValidator(...
    // ...).When(s => !s.Path.IsNullOrWhiteSpace()) -- CascadeMode.Stop means
    // the chained path-content validators only run if IsValidPath() itself
    // passed (matches this if/else split below).
    if (resource.path && resource.path.trim() !== "") {
      if (!isValidFolderPath(resource.path)) {
        failures.push({ propertyName: "path", errorMessage: "Path is not a valid path" });
      } else {
        if (!isNotExistingRootFolderPath(rootFolderService, resource.path)) {
          failures.push({
            propertyName: "path",
            errorMessage: "Path is already configured as a root folder",
          });
        }
        // mappedNetworkDriveValidator is chained here in the real C# rule
        // order (after RootFolderValidator, before AuthorPathValidator) --
        // see module doc comment on mappedNetworkDriveCheck being optional.
        if (mappedNetworkDriveCheck) {
          const { isWindows, runtimeInfo, diskProvider } = mappedNetworkDriveCheck;
          if (
            !isNotMappedNetworkDriveUnderWindowsService(
              isWindows,
              runtimeInfo,
              diskProvider,
              resource.path
            )
          ) {
            failures.push({
              propertyName: "path",
              errorMessage:
                "Path is a mapped network drive and Pagarr is running as a Windows service",
            });
          }
        }
        if (!isNotAnotherAuthorsPath(authorService, resource.path, resource.id)) {
          failures.push({
            propertyName: "path",
            errorMessage: "Path is already configured for another author",
          });
        }
        if (!isNotAncestorOfExistingAuthor(authorService, resource.path)) {
          failures.push({
            propertyName: "path",
            errorMessage: "Path is an ancestor of an existing author",
          });
        }
        if (recycleBinPath) {
          const recycleBinResult = validateAgainstRecycleBin(recycleBinPath, resource.path);
          if (!recycleBinResult.isValid) {
            failures.push({
              propertyName: "path",
              errorMessage: `Path cannot be ${recycleBinResult.relationship} the Recycle Bin`,
            });
          }
        }
        const systemFolderResult = validateAgainstSystemFolders(resource.path);
        if (!systemFolderResult.isValid) {
          failures.push({
            propertyName: "path",
            errorMessage: `Path cannot be ${systemFolderResult.relationship} an OS system folder`,
          });
        }
      }
    }

    // Ported: RuleFor(s => s.QualityProfileId).SetValidator(qualityProfileExistsValidator),
    // RuleFor(s => s.MetadataProfileId).SetValidator(metadataProfileExistsValidator) --
    // separate rules from the ValidId ones above (FluentValidation runs
    // every RuleFor chain for a property independently, not cascaded across
    // different RuleFor(...) calls for the same property).
    if (!isValidQualityProfileId(qualityProfileService, resource.qualityProfileId)) {
      failures.push({
        propertyName: "qualityProfileId",
        errorMessage: "Quality Profile does not exist",
      });
    }
    if (!isValidMetadataProfileId(metadataProfileService, resource.metadataProfileId)) {
      failures.push({
        propertyName: "metadataProfileId",
        errorMessage: "Metadata Profile does not exist",
      });
    }

    return failures;
  };

  const postValidator: ResourceValidator<AuthorResource> = (resource) => {
    const failures: ValidationFailure[] = [];

    // Ported: RuleFor(s => s.Path).IsValidPath().When(s => s.RootFolderPath.IsNullOrWhiteSpace()).
    if (isBlank(resource.rootFolderPath) && !isValidFolderPath(resource.path)) {
      failures.push({ propertyName: "path", errorMessage: "Path is not a valid path" });
    }

    // Ported: RuleFor(s => s.RootFolderPath).IsValidPath().SetValidator(
    // authorFolderAsRootFolderValidator).When(s => s.Path.IsNullOrWhiteSpace()).
    if (isBlank(resource.path)) {
      if (!isValidFolderPath(resource.rootFolderPath)) {
        failures.push({
          propertyName: "rootFolderPath",
          errorMessage: "Root folder path is not a valid path",
        });
      } else if (getAuthorFolder) {
        const folderResult = isValidAuthorFolderAsRootFolder(
          getAuthorFolder,
          resource,
          resource.rootFolderPath
        );
        if (!folderResult.isValid) {
          failures.push({
            propertyName: "rootFolderPath",
            errorMessage: `Root folder path '${folderResult.rootFolderPath}' contains author folder '${folderResult.authorFolder}'`,
          });
        }
      }
    }

    // Ported: RuleFor(s => s.AuthorName).NotEmpty().
    if (!resource.authorName || resource.authorName.trim() === "") {
      failures.push({
        propertyName: "authorName",
        errorMessage: "'Author Name' must not be empty.",
      });
    }

    // Ported: RuleFor(s => s.ForeignAuthorId).NotEmpty().SetValidator(authorExistsValidator).
    if (!resource.foreignAuthorId || resource.foreignAuthorId.trim() === "") {
      failures.push({
        propertyName: "foreignAuthorId",
        errorMessage: "'Foreign Author Id' must not be empty.",
      });
    } else if (!isNewAuthor(authorService, resource.foreignAuthorId)) {
      failures.push({
        propertyName: "foreignAuthorId",
        errorMessage: "This author has already been added",
      });
    }

    return failures;
  };

  // Ported: PutValidator.RuleFor(s => s.Path).IsValidPath() -- note this has
  // NO `.When(...)` guard in the real C# source, unlike PostValidator's Path
  // rule, so it always runs on PUT (an empty/unset Path on PUT would fail
  // this rule -- preserved faithfully, this is a real quirk: PUT requires a
  // non-blank valid Path even though POST tolerates a blank Path when
  // RootFolderPath is supplied instead).
  const putValidator: ResourceValidator<AuthorResource> = (resource) => {
    if (!isValidFolderPath(resource.path)) {
      return [{ propertyName: "path", errorMessage: "Path is not a valid path" }];
    }
    return [];
  };

  // ---- restControllerWithSignalR wiring ----------------------------------

  const { router, unsubscribe } = restControllerWithSignalR<AuthorResource, Author>({
    resourceName: AUTHOR_RESOURCE_NAME,
    eventAggregator,
    signalRBroadcaster,

    sharedValidator,
    postValidator,
    putValidator,

    /** Ported from `AllAuthors()` -- `[HttpGet]` with no id, the real `GET /` action. */
    getAll: () => {
      const resources: AuthorResource[] = [];
      for (const author of authorService.getAllAuthors()) {
        const resource = authorToResource(author);
        if (resource !== null) {
          resources.push(resource);
        }
      }

      mapCoversToLocal(...resources);
      linkNextPreviousBooks(...resources);
      linkAuthorStatisticsBulk(resources);
      linkRootFolderPath(...resources);

      return resources;
    },

    getById: (id) => getResourceById(id),

    /** Ported from `AddAuthor(AuthorResource authorResource)`: `[RestPostById]`. */
    create: (resource) => {
      const model = authorResourceToModel(resource);
      if (model === null) {
        throw new Error("create: resource must not be null");
      }
      const author = addAuthorService.addAuthor(model);
      return getResourceById(author.id);
    },

    /** Ported from `UpdateAuthor(AuthorResource authorResource, bool moveFiles = false)`: `[RestPutById]`. */
    update: (resource, req) => {
      const author = authorService.getAuthor(resource.id);
      const moveFiles = parseBoolQuery(req.query["moveFiles"]);

      if (moveFiles) {
        const command = new MoveAuthorCommand();
        command.authorId = author.id;
        command.sourcePath = author.path;
        command.destinationPath = resource.path;

        commandQueueManager.push(command, CommandPriority.Normal, CommandTrigger.Manual);
      }

      const model = authorResourceToModelMerge(resource, author);
      authorService.updateAuthor(model);

      // Ported: `BroadcastResourceChange(ModelAction.Updated, authorResource)`
      // -- broadcasts the RAW resource passed in (not a re-fetched one),
      // distinct from the Accepted(...) response body below which DOES
      // re-fetch via GetResourceById.
      if (signalRBroadcaster.isConnected) {
        signalRBroadcaster.broadcastResourceChange(
          ModelAction.Updated,
          AUTHOR_RESOURCE_NAME,
          resource
        );
      }

      return getResourceById(resource.id);
    },

    /** Ported from `DeleteAuthor(int id, bool deleteFiles = false, bool addImportListExclusion = false)`: `[RestDeleteById]`. */
    delete: (id, req) => {
      const deleteFiles = parseBoolQuery(req.query["deleteFiles"]);
      const addImportListExclusion = parseBoolQuery(req.query["addImportListExclusion"]);

      authorService.deleteAuthor(id, deleteFiles, addImportListExclusion);
    },

    getResourceByIdForBroadcast: (id) => getResourceById(id),
  });

  // ---- Extra IHandle<T> subscriptions (see module doc comment) ----------

  function broadcastIfConnected(resource: AuthorResource | null): void {
    if (resource === null || !signalRBroadcaster.isConnected) {
      return;
    }
    signalRBroadcaster.broadcastResourceChange(ModelAction.Updated, AUTHOR_RESOURCE_NAME, resource);
  }

  const handlers: AuthorControllerHandlers = {
    handleBookImported: (message) => {
      broadcastIfConnected(getAuthorResource(message.author));
    },
    handleBookEdited: (message) => {
      broadcastIfConnected(getAuthorResource(message.book.author));
    },
    handleBookFileDeleted: (message) => {
      if (message.reason === "Upgrade") {
        return;
      }
      broadcastIfConnected(getAuthorResource(message.bookFile.author ?? null));
    },
    handleAuthorAdded: (message) => {
      broadcastIfConnected(getAuthorResource(message.author));
    },
    handleAuthorUpdated: (message) => {
      broadcastIfConnected(getAuthorResource(message.author));
    },
    handleAuthorEdited: (message) => {
      broadcastIfConnected(getAuthorResource(message.author));
    },
    handleAuthorDeleted: (message) => {
      // Ported: `BroadcastResourceChange(ModelAction.Deleted,
      // message.Author.ToResource())` -- the bare mapper, no
      // covers/stats/next-book linking. See interface doc comment.
      if (!signalRBroadcaster.isConnected) {
        return;
      }
      const resource = authorToResource(message.author);
      if (resource !== null) {
        signalRBroadcaster.broadcastResourceChange(
          ModelAction.Deleted,
          AUTHOR_RESOURCE_NAME,
          resource
        );
      }
    },
    handleAuthorRenamed: (message) => {
      // Ported: `BroadcastResourceChange(ModelAction.Updated, message.Author.Id)`
      // -- the `(action, int id)` overload (RestControllerWithSignalR.cs):
      // for any non-Deleted action this re-fetches the full resource via
      // `GetResourceById(id)` and broadcasts THAT (only a Deleted action
      // broadcasts a bare `{ Id = id }` placeholder instead) -- so this is
      // NOT actually an "id-only, no resource body" broadcast on the wire;
      // it's the normal full-resource broadcast, just looked up by id
      // rather than handed a resource directly (the difference from every
      // other handler here is purely that the C# event only carries an id,
      // not a full Author).
      broadcastIfConnected(getResourceById(message.author.id));
    },
    handleMediaCoversUpdated: (message) => {
      broadcastIfConnected(getAuthorResource(message.author));
    },
  };

  return { router, handlers, unsubscribe };
}

/** Ported from `bool moveFiles = false`/`bool deleteFiles = false`/`bool addImportListExclusion = false` query-string model binding: ASP.NET's default model binder treats an ABSENT query param as the parameter's default (false here), and parses `"true"`/`"false"` (case-insensitive) for a present one -- `"1"`/`"0"` are NOT accepted by ASP.NET's bool binder (unlike this port's `RestController.ts`-adjacent query-flag helpers elsewhere that accept both; this is intentionally the stricter, ASP.NET-faithful parse for this specific controller's optional bool query params). */
function parseBoolQuery(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return value.toLowerCase() === "true";
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}
