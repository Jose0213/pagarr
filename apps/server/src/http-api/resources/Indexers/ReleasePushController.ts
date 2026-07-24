import { Router, type Request, type Response } from "express";
import type {
  IProvider,
  IProviderConfig,
  IProviderFactory,
} from "../../../thingi-provider/index.js";
import type { DownloadDecision } from "../../../decision-engine/index.js";
import { createReleaseInfo, type ReleaseInfo } from "../../../indexers/releaseInfo.js";
import { ValidationException } from "../../../validation/validationResult.js";
import { requestPath, validateResource } from "../../rest/RestController.js";
import { noopValidator, type ResourceValidator } from "../../rest/ResourceValidator.js";
import { mapDecisions } from "./ReleaseModuleBase.js";
import { releaseResourceToModel, type ReleaseResource } from "./ReleaseResource.js";

/**
 * Ported from Readarr.Api.V1/Indexers/ReleasePushController.cs.
 *
 * ```csharp
 * [V1ApiController("release/push")]
 * public class ReleasePushController : ReleaseControllerBase
 * ```
 * -- mounted at `release/push`, not `release` (the `V1ApiController`
 * attribute's route-template override; this port's caller mounts the
 * router returned here at whatever path it chooses, matching every other
 * controller in this module).
 *
 * ## Forward-referenced collaborators
 *
 * `IProcessDownloadDecisions`/`ProcessDecision` (`NzbDrone.Core.Download`)
 * isn't a ported module in this worktree's scope -- narrowed to
 * `IProcessDownloadDecisionsLike.processDecision(decision,
 * downloadClientId)`, the single-decision sibling of `indexer-search/
 * collaborators.ts`'s already-established `IProcessDownloadDecisionsLike
 * .processDecisions` (plural) forward-reference for the exact same
 * not-yet-ported module.
 *
 * `IDownloadClientFactory` (`NzbDrone.Core.Download`) is similarly
 * forward-referenced, narrowed to the one method this controller calls
 * (`all()`, to resolve a bare `DownloadClient` name to an id).
 *
 * ## `PushLock`
 *
 * Ported from the real source's `private static readonly object PushLock =
 * new object();` + `lock (PushLock) { ... }` around the
 * `GetRssDecision`+`ProcessDecision` pair -- a cross-request mutex
 * guaranteeing two concurrent pushes don't race on state
 * `DownloadDecisionMaker`/`ProcessDownloadDecisions` might share. Node's
 * single-threaded event loop has no equivalent race for synchronous code,
 * but `GetRssDecision`+`ProcessDecision` here are `await`ed (async), so
 * two concurrent requests COULD interleave between the two calls the way
 * the C# lock explicitly prevents -- `pushMutex` below is a minimal
 * promise-chain mutex reproducing the same "only one push's decision+process
 * pair runs at a time" guarantee.
 */

export interface IProcessDownloadDecisionsLike {
  processDecision(decision: DownloadDecision, downloadClientId?: number): Promise<void>;
}

export interface DownloadClientLike {
  id: number;
  name: string;
}

export interface DownloadClientFactoryLike {
  all(): DownloadClientLike[];
}

const noDownloadClients: DownloadClientFactoryLike = { all: () => [] };

/** Ported from the ctor's four `PostValidator.RuleFor(...)` rules. */
const postValidator: ResourceValidator<ReleaseResource> = (release) => {
  const failures: ReturnType<ResourceValidator<ReleaseResource>> = [];

  if (!release.title || release.title.trim() === "") {
    failures.push({ propertyName: "title", errorMessage: "'Title' must not be empty." });
  }

  const hasMagnet = Boolean(release.magnetUrl && release.magnetUrl.trim() !== "");
  const hasDownloadUrl = Boolean(release.downloadUrl && release.downloadUrl.trim() !== "");

  // Ported: `RuleFor(s => s.DownloadUrl).NotEmpty().When(s =>
  // s.MagnetUrl.IsNullOrWhiteSpace())` -- DownloadUrl required only when
  // MagnetUrl is blank.
  if (!hasMagnet && !hasDownloadUrl) {
    failures.push({
      propertyName: "downloadUrl",
      errorMessage: "'Download Url' must not be empty.",
    });
  }

  // Ported: `RuleFor(s => s.MagnetUrl).NotEmpty().When(s =>
  // s.DownloadUrl.IsNullOrWhiteSpace())` -- MagnetUrl required only when
  // DownloadUrl is blank. NOTE: both rules read as written above are
  // effectively the same "at least one of the two must be set" constraint
  // expressed twice (When(A blank) require B, When(B blank) require A) --
  // preserved as two independent checks matching the real two separate
  // FluentValidation rules, not collapsed into one, since a caller
  // supplying NEITHER trips both and gets both failure messages (matches
  // FluentValidation's own "run every rule, collect every failure"
  // behavior -- this is not a single early-exit check).
  if (!hasDownloadUrl && !hasMagnet) {
    failures.push({ propertyName: "magnetUrl", errorMessage: "'Magnet Url' must not be empty." });
  }

  if (release.protocol === undefined || release.protocol === null) {
    failures.push({ propertyName: "protocol", errorMessage: "'Protocol' must not be empty." });
  }

  if (!release.publishDate) {
    failures.push({
      propertyName: "publishDate",
      errorMessage: "'Publish Date' must not be empty.",
    });
  }

  return failures;
};

/** Ported from `ReleasePushController.ResolveIndexer(ReleaseInfo release)`. */
function resolveIndexer(
  release: ReleaseInfo,
  indexerFactory: IProviderFactory<IProvider<IProviderConfig>, IProviderConfig>
): void {
  if (release.indexerId === 0 && release.indexer) {
    const indexer = indexerFactory
      .all()
      .find((d) => d.name.toLowerCase() === release.indexer!.toLowerCase());

    if (indexer) {
      release.indexerId = indexer.id;
    }
  } else if (release.indexerId !== 0 && !release.indexer) {
    try {
      const indexer = indexerFactory.get(release.indexerId);
      release.indexer = indexer.name;
    } catch {
      release.indexerId = 0;
    }
  }
}

/** Ported from `ReleasePushController.ResolveDownloadClientId(ReleaseResource release)`. */
function resolveDownloadClientId(
  release: ReleaseResource,
  downloadClientFactory: DownloadClientFactoryLike
): number | undefined {
  const downloadClientId = release.downloadClientId ?? 0;

  if (downloadClientId === 0 && release.downloadClient) {
    const downloadClient = downloadClientFactory
      .all()
      .find((c) => c.name.toLowerCase() === release.downloadClient!.toLowerCase());

    if (downloadClient) {
      return downloadClient.id;
    }
  }

  return release.downloadClientId;
}

/** Ported from the ctor's `private static readonly object PushLock` + `lock (PushLock)` -- see this module's doc comment. */
function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };
}

export interface ReleasePushControllerOptions {
  downloadDecisionMaker: {
    getRssDecision(reports: ReleaseInfo[], pushedRelease?: boolean): DownloadDecision[];
  };
  downloadDecisionProcessor: IProcessDownloadDecisionsLike;
  /** Typically `IndexerAdapter.ts`'s `IndexerProviderFactoryAdapter` -- any `IProviderFactory<IProvider<IProviderConfig>, IProviderConfig>` works structurally. */
  indexerFactory: IProviderFactory<IProvider<IProviderConfig>, IProviderConfig>;
  downloadClientFactory?: DownloadClientFactoryLike;
}

/**
 * Builds the `ReleasePushController` Express router (`POST /` -- the
 * manual-release-push/grab endpoint, mounted by a caller at `release/push`
 * per the real `[V1ApiController("release/push")]` route override).
 */
export function releasePushController(options: ReleasePushControllerOptions): Router {
  const {
    downloadDecisionMaker,
    downloadDecisionProcessor,
    indexerFactory,
    downloadClientFactory = noDownloadClients,
  } = options;

  const withPushLock = createMutex();

  const router = Router();

  router.post("/", (req: Request, res: Response, next) => {
    void (async () => {
      try {
        const release = req.body as ReleaseResource;

        validateResource(release, "POST", requestPath(req), {
          sharedValidator: noopValidator<ReleaseResource>(),
          postValidator,
          putValidator: noopValidator<ReleaseResource>(),
        });

        const info = releaseResourceToModel(release);
        info.guid = `PUSH-${info.downloadUrl}`;

        resolveIndexer(info, indexerFactory);

        const downloadClientId = resolveDownloadClientId(release, downloadClientFactory);

        const decision = await withPushLock(async () => {
          const decisions = downloadDecisionMaker.getRssDecision([info], true);
          const pushedDecision = decisions[0];

          if (pushedDecision) {
            await downloadDecisionProcessor.processDecision(pushedDecision, downloadClientId);
          }

          return pushedDecision;
        });

        if (!decision?.remoteBook.parsedBookInfo) {
          throw new ValidationException([
            { propertyName: "title", errorMessage: "Unable to parse" },
          ]);
        }

        res.json(mapDecisions([decision])[0]);
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}

// Re-export for callers that want the base ReleaseInfo constructor without
// a second import path.
export { createReleaseInfo };
