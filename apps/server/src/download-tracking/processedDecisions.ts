import type { DownloadDecision } from "../decision-engine/downloadDecision.js";

/** Ported from NzbDrone.Core/Download/ProcessedDecisions.cs. */
export class ProcessedDecisions {
  constructor(
    public readonly grabbed: DownloadDecision[],
    public readonly pending: DownloadDecision[],
    public readonly rejected: DownloadDecision[]
  ) {}
}
