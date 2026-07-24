import type { RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/Update/UpdateResource.cs.
 *
 * ## Why this exists despite `Update` being explicitly skipped in Phase 4
 *
 * PORT_PLAN.md marks the core `Update` module (`NzbDrone.Core/Update/*.cs`,
 * ~20 files: `IRecentUpdateProvider`, `IUpdateHistoryService`,
 * `InstallUpdateService`, the self-update download/extract/restart
 * pipeline) as explicitly skipped -- "self-update mechanism, not applicable
 * to a self-hosted single-container app with its own deploy/update story"
 * (a Docker image gets updated by pulling a new tag, not by the app
 * downloading and installing its own replacement). That reasoning holds for
 * this task too: there is nothing for this port's `UpdateController` to
 * meaningfully query.
 *
 * Per this task's explicit brief, though, the HTTP endpoint itself is
 * ported as a thin stub -- not skipped outright -- so any existing frontend
 * client (the ported Readarr React UI, which has an Updates settings page
 * expecting `GET /api/v1/update` to return a `UpdateResource[]`) does not
 * break against a bare 404. `UpdateResource`'s wire shape is preserved
 * exactly; `getRecentUpdates()` (UpdateController.ts) always returns `[]`
 * (this port's substitute for "no updates available," the only truthful
 * answer a container-deployed app can give), so a client reads a valid,
 * empty updates list rather than an error state.
 *
 * `Version`/`Changes` are C# types with no meaningful Pagarr equivalent
 * (`System.Version`, `NzbDrone.Core.Update.UpdateChanges`) -- kept as plain
 * `string`/`{ new, fixed }` shapes for wire-format fidelity even though no
 * code path in this port ever constructs a non-empty `UpdateResource`.
 */
export interface UpdateChanges {
  new: string[];
  fixed: string[];
}

export interface UpdateResource extends RestResource {
  version: string;
  branch: string;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  releaseDate: string;
  fileName: string;
  url: string;
  installed: boolean;
  /** ISO-8601 timestamp string or null (C# `DateTime?`). */
  installedOn: string | null;
  installable: boolean;
  latest: boolean;
  changes: UpdateChanges;
  hash: string;
}
