import type { Router } from "express";
import { restController } from "../../rest/RestController.js";
import type { ICustomFilterService } from "../../../custom-filters/customFilterService.js";
import {
  customFilterToModel,
  customFilterToResource,
  customFiltersToResource,
} from "./CustomFilterResource.js";
import type { CustomFilterResource } from "./CustomFilterResource.js";

/**
 * Ported from Readarr.Api.V1/CustomFilters/CustomFilterController.cs.
 *
 * Plain `RestController<CustomFilterResource>` (no SignalR broadcasting --
 * the real C# `CustomFilterController` does NOT extend
 * `RestControllerWithSignalR`, unlike Tags/RootFolders/Health/Commands).
 */
export interface CustomFilterControllerOptions {
  customFilterService: ICustomFilterService;
}

export function customFilterController(options: CustomFilterControllerOptions): Router {
  const { customFilterService } = options;

  return restController<CustomFilterResource>({
    getAll: () => customFiltersToResource(customFilterService.all()),

    getById: (id) => customFilterToResource(customFilterService.get(id)),

    create: (resource) => {
      const created = customFilterService.add(customFilterToModel(resource));
      return customFilterToResource(created);
    },

    update: (resource) => {
      const updated = customFilterService.update(customFilterToModel(resource));
      return customFilterToResource(updated);
    },

    delete: (id) => {
      customFilterService.delete(id);
    },
  });
}
