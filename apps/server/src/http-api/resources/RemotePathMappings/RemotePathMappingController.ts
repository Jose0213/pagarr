import type { Router } from "express";
import type { RemotePathMappingService } from "../../../download-tracking/remote-path-mappings/remotePathMappingService.js";
import { restController } from "../../rest/RestController.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import {
  remotePathMappingToModel,
  remotePathMappingToResource,
  type RemotePathMappingResource,
} from "./RemotePathMappingResource.js";

/**
 * Ported from Readarr.Api.V1/RemotePathMappings/RemotePathMappingController.cs.
 *
 * ```
 * public class RemotePathMappingController : RestController<RemotePathMappingResource>
 * {
 *     public RemotePathMappingController(IRemotePathMappingService remotePathMappingService,
 *                                    PathExistsValidator pathExistsValidator,
 *                                    MappedNetworkDriveValidator mappedNetworkDriveValidator)
 *     {
 *         SharedValidator.RuleFor(c => c.Host).NotEmpty();
 *         SharedValidator.RuleFor(c => c.RemotePath).NotEmpty();
 *         SharedValidator.RuleFor(c => c.LocalPath)
 *             .Cascade(CascadeMode.Stop)
 *             .IsValidPath()
 *             .SetValidator(mappedNetworkDriveValidator)
 *             .SetValidator(pathExistsValidator)
 *             .SetValidator(new SystemFolderValidator())
 *             .NotEqual("/").WithMessage("Cannot be set to '/'");
 *     }
 * }
 * ```
 *
 * Plain CRUD -- `restController()`, not `providerControllerBase()` (a
 * remote path mapping isn't a `ThingiProvider`-kind pluggable provider; no
 * `Fields`/`Implementation`/schema/test/bulk routes in the real C# either,
 * confirmed directly against the source: `RestController<RemotePathMappingResource>`,
 * not `ProviderControllerBase<...>`).
 *
 * ## `LocalPath`'s validator chain -- narrowed, not fabricated
 *
 * `IsValidPath()` + `MappedNetworkDriveValidator` + `PathExistsValidator` +
 * `SystemFolderValidator` all depend on not-yet-ported infra
 * (`NzbDrone.Common.Disk.IDiskProvider`, `IRuntimeInfo`,
 * `NzbDrone.Common.Disk.SystemFolders`) -- none of which any other
 * already-merged module in this port has stood up yet (the closest
 * precedent, `RemotePathMappingService.ts`'s own `folderExists` deviation
 * note, takes the exact same approach: an injectable predicate defaulting
 * to "assume valid", not a fabricated implementation). This controller
 * follows suit:
 *   - `IsValidPath()` -- ported via `OsPath.isRootedOsPath` (this module's
 *     own already-ported `RemotePathMappingService.validateMapping` already
 *     enforces "must be rooted, must not be empty" server-side; this
 *     controller-level check is a genuine duplicate in the real C# too --
 *     both the controller's SharedValidator AND the service's
 *     `ValidateMapping` independently check overlapping conditions, matched
 *     here by simply calling through to the same `RemotePathMappingService`
 *     the real service-level check already lives on, rather than
 *     re-deriving a parallel narrower rule here).
 *   - `MappedNetworkDriveValidator`/`PathExistsValidator`/
 *     `SystemFolderValidator` -- exposed as three optional injectable
 *     predicates (`isMappedNetworkDrive`/`pathExists`/`isSystemFolder`),
 *     each defaulting to the permissive "assume valid" answer (matching
 *     `RemotePathMappingService`'s own `folderExists` default) since none
 *     of `IDiskProvider`/`IRuntimeInfo`/`SystemFolders` exist in this port
 *     yet to answer them for real. Wiring a real disk-backed answer in is
 *     additive future work, not a behavior change to this controller's own
 *     shape.
 *   - `NotEqual("/")` IS fully faithful (no forward-ref needed) -- a bare
 *     string comparison.
 */

export interface RemotePathMappingControllerOptions {
  service: RemotePathMappingService;
  /** Forward-ref for `MappedNetworkDriveValidator` -- see module doc comment. Defaults to always-valid (non-Windows-service assumption). */
  isMappedNetworkDrive?: (localPath: string) => boolean;
  /** Forward-ref for `PathExistsValidator` -- see module doc comment. Defaults to always-valid. */
  pathExists?: (localPath: string) => boolean;
  /** Forward-ref for `SystemFolderValidator` -- see module doc comment. Defaults to "never a system folder". */
  isSystemFolder?: (localPath: string) => boolean;
}

/** Ported from `SharedValidator.RuleFor(c => c.Host).NotEmpty()`. */
function validateHost(resource: RemotePathMappingResource) {
  if (!resource.host || resource.host.trim() === "") {
    return [{ propertyName: "host", errorMessage: "'Host' must not be empty." }];
  }
  return [];
}

/** Ported from `SharedValidator.RuleFor(c => c.RemotePath).NotEmpty()`. */
function validateRemotePath(resource: RemotePathMappingResource) {
  if (!resource.remotePath || resource.remotePath.trim() === "") {
    return [{ propertyName: "remotePath", errorMessage: "'Remote Path' must not be empty." }];
  }
  return [];
}

export function remotePathMappingController(options: RemotePathMappingControllerOptions): Router {
  const { service } = options;
  const isMappedNetworkDrive = options.isMappedNetworkDrive ?? (() => false);
  const pathExists = options.pathExists ?? (() => true);
  const isSystemFolder = options.isSystemFolder ?? (() => false);

  /** Ported from `SharedValidator.RuleFor(c => c.LocalPath).Cascade(CascadeMode.Stop)...` -- `CascadeMode.Stop` means the first failing rule in the chain short-circuits the rest, matched here by returning after the first failure. */
  const validateLocalPath: ResourceValidator<RemotePathMappingResource> = (resource) => {
    const localPath = resource.localPath ?? "";

    if (!localPath || localPath.trim() === "") {
      return [{ propertyName: "localPath", errorMessage: "Path must not be empty" }];
    }

    if (isMappedNetworkDrive(localPath)) {
      return [
        { propertyName: "localPath", errorMessage: "Mapped Network Drive and Windows Service" },
      ];
    }

    if (!pathExists(localPath)) {
      return [{ propertyName: "localPath", errorMessage: `Path '${localPath}' does not exist` }];
    }

    if (isSystemFolder(localPath)) {
      return [
        {
          propertyName: "localPath",
          errorMessage: `Path '${localPath}' is set to or a child of a system folder`,
        },
      ];
    }

    if (localPath === "/") {
      return [{ propertyName: "localPath", errorMessage: "Cannot be set to '/'" }];
    }

    return [];
  };

  const sharedValidator: ResourceValidator<RemotePathMappingResource> = (resource) => [
    ...validateHost(resource),
    ...validateRemotePath(resource),
    ...validateLocalPath(resource),
  ];

  return restController<RemotePathMappingResource>({
    getAll: () => service.all().map(remotePathMappingToResource),
    getById: (id) => remotePathMappingToResource(service.get(id)),
    create: (resource) =>
      remotePathMappingToResource(service.add(remotePathMappingToModel(resource))),
    update: (resource) =>
      remotePathMappingToResource(service.update(remotePathMappingToModel(resource))),
    delete: (id) => {
      service.remove(id);
    },
    sharedValidator,
  });
}
