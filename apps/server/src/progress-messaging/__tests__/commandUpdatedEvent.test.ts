import { describe, expect, it } from "vitest";
import { CommandUpdatedEvent } from "../commandUpdatedEvent.js";
import { newCommandModel } from "../../messaging/commands/commandModel.js";
import { TestCommand } from "../../messaging/commands/testCommand.js";

describe("CommandUpdatedEvent", () => {
  it("carries the command it was constructed with", () => {
    const command = newCommandModel({ body: new TestCommand() });
    const event = new CommandUpdatedEvent(command);

    expect(event.command).toBe(command);
  });
});
