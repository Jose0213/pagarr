import type { RemoteBook } from "../../parser/model/remoteBook.js";
import type { IAggregateRemoteBook } from "./aggregateRemoteBook.js";

/**
 * Ported from NzbDrone.Core/Download/Aggregation/RemoteBookAggregationService.cs.
 *
 * No NLog `Logger` -- per this port's established no-NLog-yet convention
 * (see config/configService.ts's doc comment), the `_logger.Warn(ex,
 * ex.Message)` catch-and-log-and-continue becomes an optional `onError`
 * callback (default no-op), preserving the "one bad augmenter never blocks
 * the others" behavior without inventing a logging dependency.
 */
export interface IRemoteBookAggregationService {
  augment(remoteBook: RemoteBook): RemoteBook;
}

export class RemoteBookAggregationService implements IRemoteBookAggregationService {
  constructor(
    private readonly augmenters: IAggregateRemoteBook[],
    private readonly onError: (error: unknown) => void = () => {}
  ) {}

  augment(remoteBook: RemoteBook): RemoteBook {
    for (const augmenter of this.augmenters) {
      try {
        augmenter.aggregate(remoteBook);
      } catch (ex) {
        this.onError(ex);
      }
    }

    return remoteBook;
  }
}
