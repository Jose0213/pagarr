import type { CommandModel } from "../messaging/commands/commandModel.js";
import type { IEvent } from "../messaging/events/iEvent.js";

/** Ported from NzbDrone.Core/ProgressMessaging/CommandUpdatedEvent.cs. */
export class CommandUpdatedEvent implements IEvent {
  constructor(public readonly command: CommandModel) {}
}
