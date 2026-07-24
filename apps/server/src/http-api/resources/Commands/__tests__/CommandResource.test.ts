import { describe, expect, it } from "vitest";
import { commandModelToResource } from "../CommandResource.js";
import type { CommandModel } from "../../../../messaging/commands/commandModel.js";
import { TestCommand } from "../../../../messaging/commands/testCommand.js";
import { CommandPriority } from "../../../../messaging/commands/commandPriority.js";
import { CommandStatus } from "../../../../messaging/commands/commandStatus.js";
import { CommandResult } from "../../../../messaging/commands/commandResult.js";
import { CommandTrigger } from "../../../../messaging/commands/commandTrigger.js";

function buildModel(overrides: Partial<CommandModel> = {}): CommandModel {
  const body = new TestCommand();
  body.clientUserAgent = "MyClient/2.0";
  return {
    id: 1,
    name: "RssSync",
    body,
    priority: CommandPriority.Normal,
    status: CommandStatus.Queued,
    result: CommandResult.Unknown,
    queuedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    endedAt: null,
    duration: null,
    exception: null,
    trigger: CommandTrigger.Manual,
    message: null,
    ...overrides,
  };
}

describe("commandModelToResource", () => {
  it("splits a multi-word PascalCase name into space-separated words for commandName", () => {
    const resource = commandModelToResource(buildModel());

    expect(resource.name).toBe("RssSync");
    expect(resource.commandName).toBe("Rss Sync");
  });

  it("serializes enum fields as camelCase wire strings", () => {
    const resource = commandModelToResource(buildModel());

    expect(resource.priority).toBe("normal");
    expect(resource.status).toBe("queued");
    expect(resource.result).toBe("unknown");
    expect(resource.trigger).toBe("manual");
  });

  it("stateChangeTime prefers started, falls back to ended", () => {
    const notStarted = commandModelToResource(buildModel());
    expect(notStarted.stateChangeTime).toBeNull();

    const started = commandModelToResource(buildModel({ startedAt: "2026-01-01T00:01:00.000Z" }));
    expect(started.stateChangeTime).toBe("2026-01-01T00:01:00.000Z");

    const ended = commandModelToResource(
      buildModel({ startedAt: null, endedAt: "2026-01-01T00:02:00.000Z" })
    );
    expect(ended.stateChangeTime).toBe("2026-01-01T00:02:00.000Z");
  });

  it("simplifies a Mozilla/5.0 client user agent to null, keeps others as-is", () => {
    const withRealUa = commandModelToResource(buildModel());
    expect(withRealUa.clientUserAgent).toBe("MyClient/2.0");

    const body = new TestCommand();
    body.clientUserAgent = "Mozilla/5.0 (Macintosh)";
    const withBrowserUa = commandModelToResource(buildModel({ body }));
    expect(withBrowserUa.clientUserAgent).toBeNull();
  });
});
