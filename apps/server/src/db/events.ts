import type { ModelBase } from "./model-base.js";

/**
 * Ported from NzbDrone.Core/Datastore/Events/ModelEvent.cs.
 *
 * C#'s BasicRepository took an `IEventAggregator` (from the not-yet-ported
 * Messaging module, Phase 4) via constructor injection and published
 * ModelEvent<TModel> after Insert/Update/Delete when PublishModelEvents was
 * true for that repository subclass (false by default -- most repositories
 * never override it, per BasicRepository.cs `protected virtual bool
 * PublishModelEvents => false`).
 *
 * Since Messaging hasn't been ported yet, this defines the same
 * IEventAggregator shape ported repositories will expect, plus a no-op
 * implementation so BasicRepository is fully usable/testable today. When
 * Messaging lands, swap in a real aggregator implementing this interface --
 * no BasicRepository call sites need to change.
 */
export enum ModelAction {
  Unknown = "Unknown",
  Created = "Created",
  Updated = "Updated",
  Deleted = "Deleted",
  Sync = "Sync",
}

export class ModelEvent<TModel extends ModelBase> {
  readonly modelId: number;
  readonly model?: TModel;
  readonly action: ModelAction;

  constructor(modelOrId: TModel | number, action: ModelAction) {
    if (typeof modelOrId === "number") {
      this.modelId = modelOrId;
    } else {
      this.modelId = modelOrId.id;
      this.model = modelOrId;
    }
    this.action = action;
  }
}

export interface IEventAggregator {
  publishEvent<TModel extends ModelBase>(event: ModelEvent<TModel>): void;
}

/** No-op aggregator: used until the Messaging module (Phase 4) is ported. */
export class NullEventAggregator implements IEventAggregator {
  publishEvent(): void {
    // Intentional no-op.
  }
}
