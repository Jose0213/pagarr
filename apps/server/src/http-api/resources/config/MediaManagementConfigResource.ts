import type { IConfigService } from "../../../config/configService.js";
import type {
  AllowFingerprinting,
  FileDateType,
  ProperDownloadTypes,
  RescanAfterRefreshType,
} from "../../../config/enums.js";
import { isValidFolderPermissionMask } from "../../../validation/folderChmodValidator.js";
import { isPathValid } from "../../../validation/paths/pathValidation.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import type { RestResource } from "../../rest/RestResource.js";
import { configController } from "./configControllerBase.js";
import type { Router } from "express";

/**
 * Ported from Readarr.Api.V1/Config/{MediaManagementConfigResource,
 * MediaManagementConfigController}.cs. Mount path: `/api/v1/config/mediamanagement`.
 *
 * ## Validator deviation
 *
 * The real ctor chains SEVEN validators onto `RecycleBin` via
 * `.SetValidator(...)` (folderWritableValidator, rootFolderValidator,
 * pathExistsValidator, authorPathValidator, rootFolderAncestorValidator,
 * startupFolderValidator, systemFolderValidator) -- each requiring live
 * disk access and/or injected services (`IAuthorService`,
 * `IRootFolderService`) this controller module has no natural way to
 * receive without threading the whole app's service graph through a Config
 * router (out of scope for a REST-controller port; those services belong to
 * their own already-or-not-yet-ported modules, e.g.
 * validation/paths/authorPathValidators.ts, validation/paths/
 * rootFolderValidators.ts, validation/paths/systemFolderValidators.ts,
 * validation/paths/diskValidators.ts -- all real, all requiring an
 * `AuthorService`/`IRootFolderService`/disk-provider instance this
 * controller doesn't otherwise need). This port keeps the two
 * disk-access-free, universally-applicable checks that need no injected
 * service (`IsValidPath` -- ported directly via `isPathValid` -- and the
 * chmod-mask shape check via `isValidFolderPermissionMask`), and documents
 * the remaining five as NOT reproduced here rather than silently dropping
 * them unremarked. A future integration step wiring this controller into
 * the full app composition root (which DOES have `AuthorService`/
 * `RootFolderService`/a disk provider in scope) can inject an optional
 * extra validator via `sharedValidator` composition
 * (`combineValidators(mediaManagementConfigSharedValidator(...),
 * extraDiskValidator)` -- see rest/ResourceValidator.ts's
 * `combineValidators`) without changing this file.
 */
export interface MediaManagementConfigResource extends RestResource {
  autoUnmonitorPreviouslyDownloadedBooks: boolean;
  recycleBin: string;
  recycleBinCleanupDays: number;
  downloadPropersAndRepacks: ProperDownloadTypes;
  createEmptyAuthorFolders: boolean;
  deleteEmptyFolders: boolean;
  fileDate: FileDateType;
  watchLibraryForChanges: boolean;
  rescanAfterRefresh: RescanAfterRefreshType;
  allowFingerprinting: AllowFingerprinting;
  setPermissionsLinux: boolean;
  chmodFolder: string;
  chownGroup: string;
  skipFreeSpaceCheckWhenImporting: boolean;
  minimumFreeSpaceWhenImporting: number;
  copyUsingHardlinks: boolean;
  importExtraFiles: boolean;
  extraFileExtensions: string;
}

export function toMediaManagementConfigResource(
  model: IConfigService
): Omit<MediaManagementConfigResource, "id"> {
  return {
    autoUnmonitorPreviouslyDownloadedBooks: model.autoUnmonitorPreviouslyDownloadedBooks,
    recycleBin: model.recycleBin,
    recycleBinCleanupDays: model.recycleBinCleanupDays,
    downloadPropersAndRepacks: model.downloadPropersAndRepacks,
    createEmptyAuthorFolders: model.createEmptyAuthorFolders,
    deleteEmptyFolders: model.deleteEmptyFolders,
    fileDate: model.fileDate,
    watchLibraryForChanges: model.watchLibraryForChanges,
    rescanAfterRefresh: model.rescanAfterRefresh,
    allowFingerprinting: model.allowFingerprinting,
    setPermissionsLinux: model.setPermissionsLinux,
    chmodFolder: model.chmodFolder,
    chownGroup: model.chownGroup,
    skipFreeSpaceCheckWhenImporting: model.skipFreeSpaceCheckWhenImporting,
    minimumFreeSpaceWhenImporting: model.minimumFreeSpaceWhenImporting,
    copyUsingHardlinks: model.copyUsingHardlinks,
    importExtraFiles: model.importExtraFiles,
    extraFileExtensions: model.extraFileExtensions,
  };
}

/** camelCase keys matching `IConfigService`'s own property names -- see DownloadClientConfigResource.ts's doc comment on why this differs from the real C# reflection's PascalCase. */
function toDictionary(resource: MediaManagementConfigResource): Record<string, unknown> {
  return {
    autoUnmonitorPreviouslyDownloadedBooks: resource.autoUnmonitorPreviouslyDownloadedBooks,
    recycleBin: resource.recycleBin,
    recycleBinCleanupDays: resource.recycleBinCleanupDays,
    downloadPropersAndRepacks: resource.downloadPropersAndRepacks,
    createEmptyAuthorFolders: resource.createEmptyAuthorFolders,
    deleteEmptyFolders: resource.deleteEmptyFolders,
    fileDate: resource.fileDate,
    watchLibraryForChanges: resource.watchLibraryForChanges,
    rescanAfterRefresh: resource.rescanAfterRefresh,
    allowFingerprinting: resource.allowFingerprinting,
    setPermissionsLinux: resource.setPermissionsLinux,
    chmodFolder: resource.chmodFolder,
    chownGroup: resource.chownGroup,
    skipFreeSpaceCheckWhenImporting: resource.skipFreeSpaceCheckWhenImporting,
    minimumFreeSpaceWhenImporting: resource.minimumFreeSpaceWhenImporting,
    copyUsingHardlinks: resource.copyUsingHardlinks,
    importExtraFiles: resource.importExtraFiles,
    extraFileExtensions: resource.extraFileExtensions,
  };
}

function isLinuxOrOsx(): boolean {
  return process.platform === "linux" || process.platform === "darwin";
}

/**
 * Ported from MediaManagementConfigController's ctor SharedValidator rules
 * -- see this module's doc comment for the five disk/service-dependent
 * RecycleBin sub-validators NOT reproduced here.
 */
export function mediaManagementConfigSharedValidator(
  resource: MediaManagementConfigResource
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (resource.recycleBin.trim() !== "" && !isPathValid(resource.recycleBin)) {
    failures.push({ propertyName: "recycleBin", errorMessage: "Invalid Path" });
  }

  if (resource.recycleBinCleanupDays < 0) {
    failures.push({
      propertyName: "recycleBinCleanupDays",
      errorMessage: "'Recycle Bin Cleanup Days' must be greater than or equal to '0'.",
    });
  }

  if (
    resource.chmodFolder !== "" &&
    isLinuxOrOsx() &&
    !isValidFolderPermissionMask(resource.chmodFolder)
  ) {
    failures.push({ propertyName: "chmodFolder", errorMessage: "Must be a valid Unix permission" });
  }

  if (resource.minimumFreeSpaceWhenImporting < 100) {
    failures.push({
      propertyName: "minimumFreeSpaceWhenImporting",
      errorMessage: "'Minimum Free Space When Importing' must be greater than or equal to '100'.",
    });
  }

  return failures;
}

export function mediaManagementConfigController(configService: IConfigService): Router {
  return configController<MediaManagementConfigResource>({
    configService,
    toResource: toMediaManagementConfigResource,
    toDictionary,
    sharedValidator: mediaManagementConfigSharedValidator,
  });
}
