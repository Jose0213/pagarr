import type { LocalBook } from "../../../../parser/model/localBook.js";
import type { IAggregate } from "./aggregateLocalTrack.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Aggregation/Aggregators/AggregateQuality.cs. */
export class AggregateQuality implements IAggregate<LocalBook> {
  aggregate(localTrack: LocalBook): LocalBook {
    let quality = localTrack.fileTrackInfo?.quality ?? null;

    if (quality === null) {
      quality = localTrack.folderTrackInfo?.quality ?? null;
    }

    if (quality === null) {
      quality = localTrack.downloadClientBookInfo?.quality ?? null;
    }

    localTrack.quality = quality;
    return localTrack;
  }
}
