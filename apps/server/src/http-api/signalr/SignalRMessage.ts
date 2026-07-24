import { ModelAction } from "../../db/events.js";

/**
 * Ported from NzbDrone.SignalR/SignalRMessage.cs and
 * Readarr.Http/ResourceChangeMessage.cs.
 *
 * C# has two layered shapes here:
 *   - `SignalRMessage { Body: object, Name: string, [JsonIgnore] Action }` --
 *     the raw envelope `MessageHub`/`SignalRMessageBroadcaster` sends over
 *     the wire via `Clients.All.SendAsync("receiveMessage", message)`.
 *   - `ResourceChangeMessage<TResource> { Resource, Action }` -- what
 *     `RestControllerWithSignalR` puts INSIDE that envelope's `Body`, with
 *     two constructor overloads: one requiring `action` to be `Deleted` or
 *     `Sync` (no `Resource` -- throws `InvalidOperationException` for any
 *     other action, since a Created/Updated broadcast must carry the
 *     resource), and one taking both a resource and any action.
 *
 * This port flattens both into one wire shape (`SignalRMessage<TResource>`)
 * matching the ACTUAL bytes the C# combination puts on the wire: `{ name,
 * body: { resource, action } }` (see the task brief's own description of
 * this exact shape). `Action` is included on the wire here (unlike C#'s
 * `[JsonIgnore]` on the envelope's own `Action` -- that field existed only
 * for `MessageHub`'s internal C# bookkeeping, not serialized; but
 * `ResourceChangeMessage.Action` (the INNER one, inside Body) IS serialized
 * -- it has no JsonIgnore -- so `action` legitimately appears once, inside
 * `body`, matching the real wire format exactly).
 *
 * The "Deleted/Sync must not carry a resource, everything else must"
 * constructor-overload validation is ported as `createResourceChangeMessage()`
 * below rather than two constructor overloads (TS has no C#-style
 * overloading by required-vs-optional-first-param; a single function with a
 * runtime check is the direct equivalent).
 */
export interface SignalRMessage<TBody = unknown> {
  name: string;
  body: TBody;
}

export interface ResourceChangeBody<TResource> {
  resource?: TResource;
  action: ModelAction;
}

/**
 * Ported from ResourceChangeMessage<TResource>'s two constructors: throws if
 * `resource` is omitted and `action` is neither `Deleted` nor `Sync`
 * (matches `InvalidOperationException("Resource message without a resource
 * needs to have Delete or Sync as action")`).
 */
export function createResourceChangeBody<TResource>(
  action: ModelAction,
  resource?: TResource
): ResourceChangeBody<TResource> {
  if (resource === undefined && action !== ModelAction.Deleted && action !== ModelAction.Sync) {
    throw new Error("Resource message without a resource needs to have Delete or Sync as action");
  }

  return { resource, action };
}
