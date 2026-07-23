import { CommandStatus } from "./commandStatus.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandPriorityComparer.cs.
 *
 * Despite the class name, this compares `CommandStatus` values (not
 * `CommandPriority`) -- ported 1:1 including that naming quirk from the C#
 * source. `Started` always sorts first regardless of its numeric enum
 * value, then falls back to plain numeric ordering of the enum.
 */
export class CommandPriorityComparer {
  compare(x: CommandStatus, y: CommandStatus): number {
    if (x === CommandStatus.Started && y !== CommandStatus.Started) {
      return -1;
    }

    if (x !== CommandStatus.Started && y === CommandStatus.Started) {
      return 1;
    }

    if (x < y) {
      return -1;
    }

    if (x > y) {
      return 1;
    }

    return 0;
  }
}
