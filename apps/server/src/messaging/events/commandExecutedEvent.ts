import type { IEvent } from "./iEvent.js";
import type { CommandModel } from "../commands/commandModel.js";

/** Ported from NzbDrone.Core/Messaging/Events/CommandExecutedEvent.cs. */
export class CommandExecutedEvent implements IEvent {
  constructor(public readonly command: CommandModel) {}
}
