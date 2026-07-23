/** Ported from NzbDrone.Core/Download/ProcessedDecisionResult.cs. */
export enum ProcessedDecisionResult {
  Grabbed = "Grabbed",
  Pending = "Pending",
  Rejected = "Rejected",
  Failed = "Failed",
  Skipped = "Skipped",
}
