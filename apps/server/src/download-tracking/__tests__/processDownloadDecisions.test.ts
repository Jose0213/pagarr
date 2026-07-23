import { describe, expect, it, vi } from "vitest";
import { ProcessDownloadDecisions } from "../processDownloadDecisions.js";
import { ProcessedDecisionResult } from "../processedDecisionResult.js";
import { DownloadDecision } from "../../decision-engine/downloadDecision.js";
import { newRemoteBook, ReleaseSourceType } from "../../decision-engine/remoteBook.js";
import { Rejection } from "../../decision-engine/rejection.js";
import { RejectionType } from "../../decision-engine/rejectionType.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import { PendingReleaseReason } from "../pending/pendingReleaseReason.js";
import type { IDownloadService } from "../downloadService.js";
import type { IPrioritizeDownloadDecision } from "../../decision-engine/downloadDecisionPrioritizationService.js";
import type { PendingReleaseService } from "../pending/pendingReleaseService.js";
import {
  DownloadClientUnavailableException,
  ReleaseUnavailableException,
} from "../downloadClients.js";

function makeDecision(
  overrides: { bookIds?: number[]; rejections?: Rejection[] } = {}
): DownloadDecision {
  const remoteBook = newRemoteBook({
    author: { id: 1, qualityProfile: { id: 1, items: [] } } as never,
    books: (overrides.bookIds ?? [1]).map((id) => ({ id }) as never),
    release: {
      guid: "g",
      title: "Some Title",
      size: 1,
      downloadUrl: "http://x",
      indexerId: 1,
      indexer: "idx",
      indexerPriority: 25,
      downloadProtocol: DownloadProtocol.Usenet,
      publishDate: new Date().toISOString(),
    },
    releaseSource: ReleaseSourceType.Rss,
  });

  return new DownloadDecision(remoteBook, ...(overrides.rejections ?? []));
}

describe("ProcessDownloadDecisions", () => {
  function makeSubject(
    overrides: {
      downloadReport?: IDownloadService["downloadReport"];
      prioritizeDecisions?: IPrioritizeDownloadDecision["prioritizeDecisions"];
      add?: PendingReleaseService["add"];
      addMany?: PendingReleaseService["addMany"];
    } = {}
  ) {
    const downloadService: IDownloadService = {
      downloadReport: overrides.downloadReport ?? (async () => {}),
    };
    const prioritize: IPrioritizeDownloadDecision = {
      prioritizeDecisions: overrides.prioritizeDecisions ?? ((decisions) => decisions),
    };
    const pendingReleaseService = {
      add: overrides.add ?? vi.fn(),
      addMany: overrides.addMany ?? vi.fn(),
    } as unknown as PendingReleaseService;

    return new ProcessDownloadDecisions(downloadService, prioritize, pendingReleaseService);
  }

  describe("isQualifiedReport()", () => {
    it("is true for an approved decision with books", () => {
      const subject = makeSubject();
      expect(subject.isQualifiedReport(makeDecision())).toBe(true);
    });

    it("is true for a temporarily-rejected decision with books", () => {
      const subject = makeSubject();
      const decision = makeDecision({
        rejections: [new Rejection("delayed", RejectionType.Temporary)],
      });
      expect(subject.isQualifiedReport(decision)).toBe(true);
    });

    it("is false for a permanently-rejected decision", () => {
      const subject = makeSubject();
      const decision = makeDecision({
        rejections: [new Rejection("bad", RejectionType.Permanent)],
      });
      expect(subject.isQualifiedReport(decision)).toBe(false);
    });

    it("is false when there are no books", () => {
      const subject = makeSubject();
      const decision = makeDecision({ bookIds: [] });
      expect(subject.isQualifiedReport(decision)).toBe(false);
    });
  });

  describe("processDecision()", () => {
    it("returns Skipped for a null decision", async () => {
      const subject = makeSubject();
      expect(await subject.processDecision(null, null)).toBe(ProcessedDecisionResult.Skipped);
    });

    it("returns Rejected for an unqualified decision", async () => {
      const subject = makeSubject();
      const decision = makeDecision({
        rejections: [new Rejection("bad", RejectionType.Permanent)],
      });
      expect(await subject.processDecision(decision, null)).toBe(ProcessedDecisionResult.Rejected);
    });

    it("adds to pending and returns Pending for a temporarily-rejected decision", async () => {
      const add = vi.fn();
      const subject = makeSubject({ add });
      const decision = makeDecision({
        rejections: [new Rejection("delayed", RejectionType.Temporary)],
      });

      const result = await subject.processDecision(decision, null);

      expect(result).toBe(ProcessedDecisionResult.Pending);
      expect(add).toHaveBeenCalledWith(decision, PendingReleaseReason.Delay);
    });

    it("returns Grabbed and calls downloadService.downloadReport for an approved decision", async () => {
      const downloadReport = vi.fn(async () => {});
      const subject = makeSubject({ downloadReport });
      const decision = makeDecision();

      const result = await subject.processDecision(decision, 7);

      expect(result).toBe(ProcessedDecisionResult.Grabbed);
      expect(downloadReport).toHaveBeenCalledWith(decision.remoteBook, 7);
    });

    it("returns Rejected when the download client reports the release is no longer available", async () => {
      const subject = makeSubject({
        downloadReport: async () => {
          throw new ReleaseUnavailableException();
        },
      });

      expect(await subject.processDecision(makeDecision(), null)).toBe(
        ProcessedDecisionResult.Rejected
      );
    });

    it("returns Failed and adds to pending when the download client is unavailable", async () => {
      const add = vi.fn();
      const subject = makeSubject({
        add,
        downloadReport: async () => {
          throw new DownloadClientUnavailableException("no client");
        },
      });
      const decision = makeDecision();

      const result = await subject.processDecision(decision, null);

      expect(result).toBe(ProcessedDecisionResult.Failed);
      expect(add).toHaveBeenCalledWith(decision, PendingReleaseReason.DownloadClientUnavailable);
    });

    it("returns Skipped for an unexpected error", async () => {
      const subject = makeSubject({
        downloadReport: async () => {
          throw new Error("boom");
        },
      });

      expect(await subject.processDecision(makeDecision(), null)).toBe(
        ProcessedDecisionResult.Skipped
      );
    });
  });

  describe("processDecisions()", () => {
    it("skips a book that's already been grabbed by an earlier decision in the same batch", async () => {
      const downloadReport = vi.fn(async () => {});
      const subject = makeSubject({ downloadReport });

      const first = makeDecision({ bookIds: [1] });
      const second = makeDecision({ bookIds: [1] }); // same book id

      const result = await subject.processDecisions([first, second]);

      expect(result.grabbed).toHaveLength(1);
      expect(downloadReport).toHaveBeenCalledTimes(1);
    });

    it("separates grabbed/pending/rejected across a batch", async () => {
      const addMany = vi.fn();
      const subject = makeSubject({ addMany });

      const grabbed = makeDecision({ bookIds: [1] });
      const rejected = makeDecision({
        bookIds: [2],
        rejections: [new Rejection("bad", RejectionType.Permanent)],
      });
      const pending = makeDecision({
        bookIds: [3],
        rejections: [new Rejection("delayed", RejectionType.Temporary)],
      });

      const result = await subject.processDecisions([grabbed, rejected, pending]);

      expect(result.grabbed).toEqual([grabbed]);
      expect(result.rejected).toEqual([rejected]);
      expect(result.pending).toEqual([pending]);
      expect(addMany).toHaveBeenCalledWith([[pending, PendingReleaseReason.Delay]]);
    });

    it("stops sending further usenet releases to the client after one Usenet download fails, falling back to Pending", async () => {
      const addMany = vi.fn();
      let callCount = 0;
      const subject = makeSubject({
        addMany,
        downloadReport: async () => {
          callCount++;
          throw new DownloadClientUnavailableException("down");
        },
      });

      const first = makeDecision({ bookIds: [1] });
      const second = makeDecision({ bookIds: [2] });

      await subject.processDecisions([first, second]);

      // First triggers the real attempt (and fails); second should be
      // shortcut straight to pending without another download attempt,
      // since usenetFailed is now true.
      expect(callCount).toBe(1);
    });
  });
});
