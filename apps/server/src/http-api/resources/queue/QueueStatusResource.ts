import type { RestResource } from "../../rest/RestResource.js";

/** Ported from Readarr.Api.V1/Queue/QueueStatusResource.cs. */
export interface QueueStatusResource extends RestResource {
  totalCount: number;
  count: number;
  unknownCount: number;
  errors: boolean;
  warnings: boolean;
  unknownErrors: boolean;
  unknownWarnings: boolean;
}
