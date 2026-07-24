/**
 * Ported from Readarr.Http/REST/RestResource.cs.
 *
 * C#'s `RestResource` is an abstract base class every API DTO extends,
 * carrying two members:
 *   - `Id`, JSON-omitted when writing the default value (0) -- i.e. a
 *     freshly-constructed resource with no id set serializes without an
 *     "id" key at all.
 *   - `ResourceName`, a computed getter deriving the resource's wire name
 *     from its own runtime type name: `GetType().Name.ToLowerInvariant()
 *     .Replace("resource", "")` (e.g. `AuthorResource` -> `"author"`).
 *     `RestControllerWithSignalR` reads this to name the SignalR broadcast
 *     channel for a resource type (see signalr/SignalRBroadcaster.ts and
 *     rest/RestControllerWithSignalR.ts).
 *
 * TypeScript has no runtime reflection over a plain interface/type, so
 * there is no way to compute `resourceName` from a value's "type" the way
 * C# does. This port keeps `RestResource` as a plain data shape (`{ id }`)
 * and makes `resourceName` an explicit string each concrete resource module
 * declares up front (e.g. `export const BOOK_RESOURCE_NAME = "book";`)
 * rather than a computed property -- the direct "explicit over reflection"
 * substitute this codebase uses everywhere else a C# module leaned on
 * runtime type info (see thingi-provider/ProviderFactory.ts's doc comment
 * for the canonical statement of this pattern). Concrete Phase 5 resource
 * controllers pass their resource name as a plain string argument into
 * `restController()`/`providerControllerBase()` (see rest/RestController.ts
 * and rest/ProviderControllerBase.ts) instead of it being derived.
 *
 * The "omit id when zero" JSON behavior is preserved via `stripDefaultId()`,
 * a small serialization helper `restController()` applies to every
 * resource-shaped response body it writes -- see that file for where it's
 * invoked. This keeps the DTO shape itself defined as a plain TS
 * interface/type (no class, no decorators) as is convention throughout this
 * port, while still faithfully reproducing the wire format.
 */

/** Every REST resource DTO must have at least this shape. Ported from RestResource's `Id` property. */
export interface RestResource {
  id: number;
}

/**
 * Ported from RestResource.Id's `[JsonIgnore(Condition =
 * JsonIgnoreCondition.WhenWritingDefault)]` attribute: when a resource's id
 * is the default value (0, e.g. a not-yet-created resource returned from a
 * schema/template endpoint), omit the "id" key entirely rather than
 * serializing `"id": 0`. Returns a new object; does not mutate the input.
 */
export function stripDefaultId<T extends RestResource>(resource: T): Omit<T, "id"> | T {
  if (resource.id !== 0) {
    return resource;
  }

  const { id: _id, ...rest } = resource;
  return rest;
}
