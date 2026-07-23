import { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { DownloadDecision } from "../decision-engine/downloadDecision.js";
import type { IPrioritizeDownloadDecision } from "../decision-engine/downloadDecisionPrioritizationService.js";
import {
  DownloadClientAuthenticationException,
  DownloadClientUnavailableException,
  ReleaseUnavailableException,
} from "./downloadClients.js";
import type { IDownloadService } from "./downloadService.js";
import { PendingReleaseReason } from "./pending/pendingReleaseReason.js";
import type { PendingReleaseService } from "./pending/pendingReleaseService.js";
import { ProcessedDecisionResult } from "./processedDecisionResult.js";
import { ProcessedDecisions } from "./processedDecisions.js";

/**
 * Ported from NzbDrone.Core/Download/ProcessDownloadDecisions.cs. Imports
 * DecisionEngine's real, ported `DownloadDecision`/`IPrioritizeDownloadDecision`
 * directly, per this module's task instructions.
 *
 * No NLog Logger -- per this port's established no-NLog-yet convention
 * (`_logger.Trace`/`.Debug`/`.Warn` calls omitted).
 */
export interface IProcessDownloadDecisions {
  processDecisions(decisions: DownloadDecision[]): Promise<ProcessedDecisions>;
  processDecision(
    decision: DownloadDecision | null,
    downloadClientId: number | null
  ): Promise<ProcessedDecisionResult>;
}

export class ProcessDownloadDecisions implements IProcessDownloadDecisions {
  constructor(
    private readonly downloadService: IDownloadService,
    private readonly prioritizeDownloadDecision: IPrioritizeDownloadDecision,
    private readonly pendingReleaseService: PendingReleaseService
  ) {}

  async processDecisions(decisions: DownloadDecision[]): Promise<ProcessedDecisions> {
    const qualifiedReports = this.getQualifiedReports(decisions);
    const prioritizedDecisions =
      this.prioritizeDownloadDecision.prioritizeDecisions(qualifiedReports);
    const grabbed: DownloadDecision[] = [];
    const pending: DownloadDecision[] = [];
    const rejected = decisions.filter((d) => d.rejected);

    const pendingAddQueue: [DownloadDecision, PendingReleaseReason][] = [];

    let usenetFailed = false;
    let torrentFailed = false;

    for (const report of prioritizedDecisions) {
      const downloadProtocol = report.remoteBook.release.downloadProtocol;

      // Skip if already grabbed.
      if (isBookProcessed(grabbed, report)) {
        continue;
      }

      if (report.temporarilyRejected) {
        this.preparePending(pendingAddQueue, grabbed, pending, report, PendingReleaseReason.Delay);
        continue;
      }

      if (
        (downloadProtocol === DownloadProtocol.Usenet && usenetFailed) ||
        (downloadProtocol === DownloadProtocol.Torrent && torrentFailed)
      ) {
        this.preparePending(
          pendingAddQueue,
          grabbed,
          pending,
          report,
          PendingReleaseReason.DownloadClientUnavailable
        );
        continue;
      }

      const result = await this.processDecisionInternal(report);

      switch (result) {
        case ProcessedDecisionResult.Grabbed: {
          grabbed.push(report);
          break;
        }
        case ProcessedDecisionResult.Pending: {
          this.preparePending(
            pendingAddQueue,
            grabbed,
            pending,
            report,
            PendingReleaseReason.Delay
          );
          break;
        }
        case ProcessedDecisionResult.Rejected: {
          rejected.push(report);
          break;
        }
        case ProcessedDecisionResult.Failed: {
          this.preparePending(
            pendingAddQueue,
            grabbed,
            pending,
            report,
            PendingReleaseReason.DownloadClientUnavailable
          );

          if (downloadProtocol === DownloadProtocol.Usenet) {
            usenetFailed = true;
          } else if (downloadProtocol === DownloadProtocol.Torrent) {
            torrentFailed = true;
          }

          break;
        }
        case ProcessedDecisionResult.Skipped: {
          break;
        }
      }
    }

    if (pendingAddQueue.length > 0) {
      this.pendingReleaseService.addMany(pendingAddQueue);
    }

    return new ProcessedDecisions(grabbed, pending, rejected);
  }

  async processDecision(
    decision: DownloadDecision | null,
    downloadClientId: number | null
  ): Promise<ProcessedDecisionResult> {
    if (decision === null) {
      return ProcessedDecisionResult.Skipped;
    }

    if (!this.isQualifiedReport(decision)) {
      return ProcessedDecisionResult.Rejected;
    }

    if (decision.temporarilyRejected) {
      this.pendingReleaseService.add(decision, PendingReleaseReason.Delay);
      return ProcessedDecisionResult.Pending;
    }

    const result = await this.processDecisionInternal(decision, downloadClientId);

    if (result === ProcessedDecisionResult.Failed) {
      this.pendingReleaseService.add(decision, PendingReleaseReason.DownloadClientUnavailable);
    }

    return result;
  }

  getQualifiedReports(decisions: DownloadDecision[]): DownloadDecision[] {
    return decisions.filter((d) => this.isQualifiedReport(d));
  }

  /** Ported from `IsQualifiedReport`: process both approved and temporarily rejected. */
  isQualifiedReport(decision: DownloadDecision): boolean {
    return (
      (decision.approved || decision.temporarilyRejected) && decision.remoteBook.books.length > 0
    );
  }

  private preparePending(
    queue: [DownloadDecision, PendingReleaseReason][],
    grabbed: DownloadDecision[],
    pending: DownloadDecision[],
    report: DownloadDecision,
    reasonInput: PendingReleaseReason
  ): void {
    let reason = reasonInput;

    // If a release was already grabbed with matching books, store it as a
    // fallback and filter it out the next time it's processed. If a higher
    // quality release failed to add to the download client but a lower
    // quality release was sent to another client, still list it normally
    // (so it's apparent it'll grab next time). Delayed is treated the same,
    // but only the first is listed; subsequent items are stored as
    // Fallback.
    if (isBookProcessed(grabbed, report) || isBookProcessed(pending, report)) {
      reason = PendingReleaseReason.Fallback;
    }

    queue.push([report, reason]);
    pending.push(report);
  }

  private async processDecisionInternal(
    decision: DownloadDecision,
    downloadClientId: number | null = null
  ): Promise<ProcessedDecisionResult> {
    const remoteBook = decision.remoteBook;

    try {
      await this.downloadService.downloadReport(remoteBook, downloadClientId);
      return ProcessedDecisionResult.Grabbed;
    } catch (ex) {
      if (ex instanceof ReleaseUnavailableException) {
        return ProcessedDecisionResult.Rejected;
      }

      if (
        ex instanceof DownloadClientUnavailableException ||
        ex instanceof DownloadClientAuthenticationException
      ) {
        return ProcessedDecisionResult.Failed;
      }

      return ProcessedDecisionResult.Skipped;
    }
  }
}

/** Ported from the private `IsBookProcessed(List<DownloadDecision> decisions, DownloadDecision report)`. */
function isBookProcessed(decisions: DownloadDecision[], report: DownloadDecision): boolean {
  const bookIds = new Set(report.remoteBook.books.map((e) => e.id));
  return decisions.some((r) => r.remoteBook.books.some((e) => bookIds.has(e.id)));
}
