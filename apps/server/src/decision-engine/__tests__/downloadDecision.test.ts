import { describe, expect, it } from "vitest";
import { DownloadDecision } from "../downloadDecision.js";
import { Rejection } from "../rejection.js";
import { RejectionType } from "../rejectionType.js";
import { makeRemoteBook } from "./testFixtures.js";

describe("DownloadDecision", () => {
  it("approved is true when there are no rejections", () => {
    const decision = new DownloadDecision(makeRemoteBook());
    expect(decision.approved).toBe(true);
    expect(decision.rejected).toBe(false);
    expect(decision.temporarilyRejected).toBe(false);
  });

  it("rejected is true when any rejection is Permanent", () => {
    const decision = new DownloadDecision(
      makeRemoteBook(),
      new Rejection("temp", RejectionType.Temporary),
      new Rejection("permanent", RejectionType.Permanent)
    );

    expect(decision.approved).toBe(false);
    expect(decision.rejected).toBe(true);
    expect(decision.temporarilyRejected).toBe(false);
  });

  it("temporarilyRejected is true only when every rejection is Temporary", () => {
    const decision = new DownloadDecision(
      makeRemoteBook(),
      new Rejection("temp", RejectionType.Temporary)
    );

    expect(decision.approved).toBe(false);
    expect(decision.rejected).toBe(false);
    expect(decision.temporarilyRejected).toBe(true);
  });

  it("toString() reflects approved state", () => {
    const remoteBook = makeRemoteBook();
    const approved = new DownloadDecision(remoteBook);
    expect(approved.toString()).toBe("[OK] " + remoteBook.release.title);

    const rejected = new DownloadDecision(remoteBook, new Rejection("bad"));
    expect(rejected.toString()).toBe("[Rejected 1]" + remoteBook.release.title);
  });
});
