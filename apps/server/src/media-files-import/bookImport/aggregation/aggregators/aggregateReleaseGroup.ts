import type { LocalBook } from "../../../../parser/model/localBook.js";
import type { IAggregate } from "./aggregateLocalTrack.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Aggregation/Aggregators/AggregateReleaseGroup.cs. */
export class AggregateReleaseGroup implements IAggregate<LocalBook> {
  aggregate(localTrack: LocalBook): LocalBook {
    let releaseGroup = localTrack.downloadClientBookInfo?.releaseGroup ?? null;

    if (isNullOrWhiteSpace(releaseGroup)) {
      releaseGroup = localTrack.folderTrackInfo?.releaseGroup ?? null;
    }

    if (isNullOrWhiteSpace(releaseGroup)) {
      releaseGroup = localTrack.fileTrackInfo?.releaseGroup ?? null;
    }

    localTrack.releaseGroup = releaseGroup;

    return localTrack;
  }
}

function isNullOrWhiteSpace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}
