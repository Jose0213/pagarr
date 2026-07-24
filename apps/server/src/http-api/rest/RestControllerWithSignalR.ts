import type { Router } from "express";
import { ModelAction, ModelEvent } from "../../db/events.js";
import type { ModelBase } from "../../db/model-base.js";
import type { EventAggregator } from "../../messaging/events/eventAggregator.js";
import type { SignalRBroadcaster } from "../signalr/SignalRBroadcaster.js";
import { restController, type RestControllerOptions } from "./RestController.js";
import type { RestResource } from "./RestResource.js";

/**
 * Ported from Readarr.Http/REST/RestControllerWithSignalR.cs.
 *
 * ## Why a wrapper function, not a subclass
 *
 * Same rationale as RestController.ts/ProviderControllerBase.ts: C#'s
 * `RestControllerWithSignalR<TResource, TModel> : RestController<TResource>,
 * IHandle<ModelEvent<TModel>>` is an inheritance-based MVC base every
 * SignalR-broadcasting resource controller (e.g. `BookControllerWithSignalR`,
 * per this task's brief) subclasses, gaining automatic
 * `IHandle<ModelEvent<TModel>>` registration via DI-container reflection
 * scanning (the same mechanism `messaging/events/eventAggregator.ts`'s doc
 * comment describes replacing with explicit `subscribe()` calls -- see that
 * file for the established "explicit over reflection" precedent this port
 * follows everywhere).
 *
 * `restControllerWithSignalR()` wraps `restController()` (same options
 * shape, same returned `Router`) and ADDITIONALLY subscribes a
 * `ModelEvent<TModel>` handler on the supplied `EventAggregator` (the real,
 * concrete class from `messaging/events/eventAggregator.ts` -- its
 * `subscribe()` method, the explicit substitute for C#'s DI-container
 * handler discovery, is not part of the narrower `IEventAggregator`
 * publish-only interface, so this function needs the concrete class, not
 * an interface) that broadcasts resource changes over the supplied
 * `SignalRBroadcaster` -- reproducing `RestControllerWithSignalR.Handle
 * (ModelEvent<TModel>)`'s exact logic:
 *
 *   - No-op entirely if the broadcaster has no connected clients (ported
 *     from `IBroadcastSignalRMessage.IsConnected` guard).
 *   - `Deleted`/`Sync` actions ALSO get a resourceless broadcast first
 *     (`BroadcastResourceChange(message.Action)` with no id), THEN the
 *     normal per-id broadcast -- ported literally from `Handle`'s
 *     `if (message.Action == ModelAction.Deleted || message.Action ==
 *     ModelAction.Sync) { BroadcastResourceChange(message.Action); }`
 *     unconditionally followed by `BroadcastResourceChange(message.Action,
 *     message.ModelId);` (both calls always happen for Deleted/Sync -- this
 *     looks redundant but is preserved exactly, matching the real C#
 *     source's control flow with no early return between the two).
 *   - The per-id broadcast: for `Deleted`, broadcasts a bare `{ id }`
 *     resource shape (ported from `new TResource { Id = id }` -- this port
 *     uses whatever `createIdOnlyResource(id)` the caller supplies, since a
 *     generic `TResource` here has no `new TResource()` equivalent without
 *     reflection; see this function's own options). For any other action,
 *     re-fetches the full resource via `getResourceByIdForBroadcast`
 *     (ported from `GetResourceByIdForBroadcast`, `protected virtual`,
 *     defaulting to `GetResourceById` in the real C# base -- this port
 *     REQUIRES it explicitly rather than defaulting it from
 *     `restController()`'s own `getById` option, since that option's
 *     signature takes an Express `Request` this event-driven broadcast path
 *     has no real one to supply; callers that already have a `getById(id,
 *     req)` handler can trivially pass `(id) => getById(id, req-like-stub)`
 *     or, more simply, the same underlying id-lookup function both were
 *     built from).
 *
 * ## `Resource` name resolution and the `V1`-namespace gate -- deliberately
 * simplified
 *
 * C#'s ctor derives the SignalR channel name (`Resource`) from either a
 * `[VersionedApiController(Resource = ...)]` attribute override or
 * `new TResource().ResourceName` (reflection-derived, see RestResource.ts's
 * doc comment for why this port has no equivalent), and every broadcast
 * method additionally gates on `GetType().Namespace.Contains("V1")` --
 * i.e. broadcasts are silently skipped entirely for any controller whose
 * C# namespace isn't versioned "V1" (there's no V2 API in the real Readarr
 * source, so this gate is dead code / defensive-only in practice, never
 * observed to actually block a broadcast in the shipped app). This port
 * drops BOTH the reflection-derived name AND the namespace gate: the
 * resource name is passed explicitly as `resourceName` (identical
 * "explicit over reflection" substitution used throughout this module --
 * see RestResource.ts), and there is no namespace-string gate to reproduce
 * since this port has no C#-namespace concept at all and only ever targets
 * one API version.
 */

export interface RestControllerWithSignalROptions<
  TResource extends RestResource,
  TModel extends ModelBase,
> extends RestControllerOptions<TResource> {
  /** The SignalR broadcast channel name for this resource -- the explicit substitute for `new TResource().ResourceName`/`VersionedApiControllerAttribute.Resource`. See module doc comment. */
  resourceName: string;
  eventAggregator: EventAggregator;
  signalRBroadcaster: SignalRBroadcaster;
  /** Ported from RestControllerWithSignalR.GetResourceByIdForBroadcast. Plain id -> resource lookup (no Express `Request` involved -- this fires from an event handler, not an HTTP request). Required whenever the controller broadcasts any non-Deleted action; see module doc comment. */
  getResourceByIdForBroadcast?: (id: number) => TResource | Promise<TResource>;
  /** Builds the bare `{ id }`-shaped resource `restController()`'s generic `TResource` type requires for a Deleted broadcast -- the explicit substitute for `new TResource { Id = id }` (no parameterless-constructor reflection available on a generic `TResource` in TS). Defaults to `(id) => ({ id }) as TResource`, valid for any resource shape with no other required fields. */
  createIdOnlyResource?: (id: number) => TResource;
  /**
   * Phantom marker -- `TModel` isn't otherwise referenced by any member of
   * this options interface (it only flows into `ModelEvent<TModel>` inside
   * `restControllerWithSignalR`'s own body), but the type parameter still
   * needs to be *supplied* by callers so the function's `ModelEvent<TModel>`
   * subscription is checked against the right model type. This unused-only-
   * in-shape field keeps `TModel` from being silently inferred as
   * `unknown`/`ModelBase` at call sites; always `undefined` at runtime,
   * never read.
   */
  readonly _modelType?: TModel;
}

/**
 * Ported from RestControllerWithSignalR's ctor + `restController()`'s own
 * router wiring. Returns the same `Router` `restController()` would (this
 * function delegates to it for all five base routes), plus registers the
 * `ModelEvent<TModel>` subscription as a side effect. Returns an
 * unsubscribe function (mirrors `EventAggregator.subscribe()`'s own return
 * value) so a caller can tear down the SignalR wiring independently of the
 * router itself -- useful for tests.
 */
export function restControllerWithSignalR<TResource extends RestResource, TModel extends ModelBase>(
  options: RestControllerWithSignalROptions<TResource, TModel>
): { router: Router; unsubscribe: () => void } {
  const {
    resourceName,
    eventAggregator,
    signalRBroadcaster,
    getResourceByIdForBroadcast,
    createIdOnlyResource,
    ...restOptions
  } = options;

  const router = restController<TResource>(restOptions);

  const idOnlyResource = createIdOnlyResource ?? ((id: number) => ({ id }) as TResource);

  async function broadcastByAction(action: ModelAction, id: number): Promise<void> {
    if (!signalRBroadcaster.isConnected) {
      return;
    }

    if (action === ModelAction.Deleted) {
      signalRBroadcaster.broadcastResourceChange(action, resourceName, idOnlyResource(id));
      return;
    }

    if (!getResourceByIdForBroadcast) {
      throw new Error(
        `restControllerWithSignalR for "${resourceName}" needs getResourceByIdForBroadcast to broadcast a "${action}" resource change`
      );
    }

    const resource = await getResourceByIdForBroadcast(id);
    signalRBroadcaster.broadcastResourceChange(action, resourceName, resource);
  }

  const unsubscribe = eventAggregator.subscribe<ModelEvent<TModel>>(ModelEvent, {
    handle: (message: ModelEvent<TModel>) => {
      if (!signalRBroadcaster.isConnected) {
        return;
      }

      // Ported literally: Deleted/Sync get BOTH the resourceless broadcast
      // AND the per-id broadcast below -- see module doc comment.
      if (message.action === ModelAction.Deleted || message.action === ModelAction.Sync) {
        signalRBroadcaster.broadcastResourceChange(message.action, resourceName);
      }

      void broadcastByAction(message.action, message.modelId);
    },
  });

  return { router, unsubscribe };
}
