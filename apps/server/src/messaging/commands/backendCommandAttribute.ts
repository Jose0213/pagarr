/**
 * Ported from NzbDrone.Core/Messaging/Commands/BackendCommandAttribute.cs.
 *
 * C#: an empty marker `Attribute` subclass with no members, and -- as far
 * as this port's research into the real Readarr source could tell -- never
 * actually applied to any command class or read anywhere in
 * `NzbDrone.Core`/`Readarr.Api.V1`/`Readarr.Http` in this snapshot of the
 * source (a `grep` across the whole tree finds only the class declaration
 * itself and an unrelated same-named attribute under `MediaFiles/Commands/`
 * -- also unreferenced). Likely a vestigial hook for an API-layer
 * "hide backend-only commands from the command list" filter that was never
 * wired up. Ported as a no-op marker function (TS/JS has no attribute/
 * annotation system to attach metadata to a class declaration the way C#
 * attributes do without a decorator library, which this port doesn't use
 * elsewhere) purely for file-shape fidelity with the source tree -- calling
 * it has no effect, matching the attribute's own real-world no-op status.
 */
export function backendCommand<T extends new (...args: never[]) => object>(target: T): T {
  return target;
}
