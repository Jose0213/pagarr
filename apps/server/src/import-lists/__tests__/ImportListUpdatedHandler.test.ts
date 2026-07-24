import { describe, expect, it, vi } from "vitest";
import { ImportListUpdatedHandler } from "../ImportListUpdatedHandler.js";
import { ImportListSyncCommand } from "../ImportListSyncCommand.js";
import { createImportListDefinition } from "../ImportListDefinition.js";
import { ProviderAddedEvent } from "../../thingi-provider/events/ProviderAddedEvent.js";
import { ProviderUpdatedEvent } from "../../thingi-provider/events/ProviderUpdatedEvent.js";
import type { IManageCommandQueue } from "../../messaging/commands/commandQueueManager.js";

/**
 * Translated from NzbDrone.Core.Test/ImportListTests/ImportListUpdatedHandlerFixture.cs.
 */
function fakeCommandQueueManager(): IManageCommandQueue & { push: ReturnType<typeof vi.fn> } {
  return {
    push: vi.fn(),
    pushMany: vi.fn(() => []),
    pushByName: vi.fn(),
    queue: vi.fn(),
    all: vi.fn(() => []),
    get: vi.fn(),
    getStarted: vi.fn(() => []),
    setMessage: vi.fn(),
    setResult: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    requeue: vi.fn(),
    cancel: vi.fn(),
    cleanCommands: vi.fn(),
  };
}

describe("ImportListUpdatedHandler", () => {
  it("handle(ProviderUpdatedEvent) pushes an ImportListSyncCommand scoped to that definition's id", () => {
    const commandQueueManager = fakeCommandQueueManager();
    const handler = new ImportListUpdatedHandler(commandQueueManager);
    const definition = createImportListDefinition({ id: 7, name: "MyList" });

    handler.handle(new ProviderUpdatedEvent(definition));

    expect(commandQueueManager.push).toHaveBeenCalledTimes(1);
    const [command] = commandQueueManager.push.mock.calls[0]!;
    expect(command).toBeInstanceOf(ImportListSyncCommand);
    expect((command as ImportListSyncCommand).definitionId).toBe(7);
  });

  it("handle(ProviderAddedEvent) pushes an ImportListSyncCommand scoped to that definition's id", () => {
    const commandQueueManager = fakeCommandQueueManager();
    const handler = new ImportListUpdatedHandler(commandQueueManager);
    const definition = createImportListDefinition({ id: 13, name: "NewList" });

    handler.handle(new ProviderAddedEvent(definition));

    expect(commandQueueManager.push).toHaveBeenCalledTimes(1);
    const [command] = commandQueueManager.push.mock.calls[0]!;
    expect((command as ImportListSyncCommand).definitionId).toBe(13);
  });
});
