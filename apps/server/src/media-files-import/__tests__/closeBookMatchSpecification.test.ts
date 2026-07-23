import { describe, expect, it } from "vitest";
import { newLocalEdition, type LocalEdition } from "../../parser/model/localEdition.js";
import { Distance } from "../bookImport/identification/distance.js";
import { CloseBookMatchSpecification } from "../bookImport/specifications/closeBookMatchSpecification.js";

function editionWithDistance(distance: Distance, newDownload: boolean): LocalEdition {
  const edition = newLocalEdition();
  edition.distance = distance;
  edition.newDownload = newDownload;
  return edition;
}

describe("CloseBookMatchSpecification", () => {
  const spec = new CloseBookMatchSpecification();

  it("accepts a new download whose normalized distance is within the 0.20 threshold", () => {
    const distance = new Distance();
    distance.add("book", 0.1); // small penalty -> normalized distance well under 0.2
    const item = editionWithDistance(distance, true);

    const decision = spec.isSatisfiedBy(item, null);
    expect(decision.accepted).toBe(true);
  });

  it("rejects a new download whose normalized distance exceeds the 0.20 threshold", () => {
    const distance = new Distance();
    distance.add("book", 1.0); // max penalty -> normalized distance 1.0
    const item = editionWithDistance(distance, true);

    const decision = spec.isSatisfiedBy(item, null);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toContain("Book match is not close enough");
  });

  it("excludes missing_tracks/unmatched_tracks penalties for non-new-download (existing-library) matches", () => {
    const distance = new Distance();
    // Only missing_tracks penalized -- normalizedDistanceExcluding(["missing_tracks","unmatched_tracks"])
    // should ignore it entirely, leaving distance 0 and the match accepted.
    distance.add("missing_tracks", 1.0);
    const item = editionWithDistance(distance, false);

    const decision = spec.isSatisfiedBy(item, null);
    expect(decision.accepted).toBe(true);
  });

  it("still rejects a non-new-download match with a genuine (non-excluded) high distance", () => {
    const distance = new Distance();
    distance.add("book", 1.0);
    const item = editionWithDistance(distance, false);

    const decision = spec.isSatisfiedBy(item, null);
    expect(decision.accepted).toBe(false);
  });
});
