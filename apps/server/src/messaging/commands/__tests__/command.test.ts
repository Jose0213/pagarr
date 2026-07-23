import { describe, expect, it } from "vitest";
import { Command } from "../command.js";
import { CommandTrigger } from "../commandTrigger.js";

class RssSyncCommand extends Command {}
class BookSearchCommand extends Command {}

describe("Command", () => {
  it("computes name from the runtime type name with 'Command' stripped", () => {
    expect(new RssSyncCommand().name).toBe("RssSync");
    expect(new BookSearchCommand().name).toBe("BookSearch");
  });

  it("defaults sendUpdatesToClient to false and allows it to be set", () => {
    const command = new RssSyncCommand();
    expect(command.sendUpdatesToClient).toBe(false);

    command.sendUpdatesToClient = true;
    expect(command.sendUpdatesToClient).toBe(true);
  });

  it("defaults the other virtual flags to their base values", () => {
    const command = new RssSyncCommand();
    expect(command.updateScheduledTask).toBe(true);
    expect(command.completionMessage).toBeNull();
    expect(command.requiresDiskAccess).toBe(false);
    expect(command.isExclusive).toBe(false);
    expect(command.isTypeExclusive).toBe(false);
    expect(command.isLongRunning).toBe(false);
  });

  it("defaults scheduler bookkeeping fields", () => {
    const command = new RssSyncCommand();
    expect(command.lastExecutionTime).toBeNull();
    expect(command.lastStartTime).toBeNull();
    expect(command.trigger).toBe(CommandTrigger.Unspecified);
    expect(command.suppressMessages).toBe(false);
    expect(command.clientUserAgent).toBeNull();
  });

  it("a subclass can override sendUpdatesToClient as get-only, always reading true", () => {
    class AlwaysUpdatesCommand extends Command {
      override get sendUpdatesToClient(): boolean {
        return true;
      }
    }

    const command = new AlwaysUpdatesCommand();
    expect(command.sendUpdatesToClient).toBe(true);
  });
});
