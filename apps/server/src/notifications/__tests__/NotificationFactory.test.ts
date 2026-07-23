import { describe, expect, it, vi } from "vitest";
import type { IProviderRepository } from "../../thingi-provider/IProviderRepository.js";
import { NULL_CONFIG_INSTANCE, type NullConfig } from "../../thingi-provider/NullConfig.js";
import type { INotification } from "../INotification.js";
import {
  createNotificationDefinition,
  type NotificationDefinition,
} from "../NotificationDefinition.js";
import { NotificationFactory } from "../NotificationFactory.js";
import type { INotificationStatusService } from "../NotificationStatusService.js";
import { createNotificationStatus } from "../NotificationStatus.js";

function fakeNotification(
  name: string,
  overrides: Partial<INotification<NullConfig>> = {}
): INotification<NullConfig> {
  return {
    name,
    configContract: "NullConfig",
    message: null,
    link: "https://example.test",
    defaultDefinitions: [],
    definition: createNotificationDefinition<NullConfig>({ name, implementation: name }),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    requestAction: vi.fn(),
    onGrab: vi.fn(),
    onReleaseImport: vi.fn(),
    onRename: vi.fn(),
    onAuthorAdded: vi.fn(),
    onAuthorDelete: vi.fn(),
    onBookDelete: vi.fn(),
    onBookFileDelete: vi.fn(),
    onHealthIssue: vi.fn(),
    onApplicationUpdate: vi.fn(),
    onDownloadFailure: vi.fn(),
    onImportFailure: vi.fn(),
    onBookRetag: vi.fn(),
    processQueue: vi.fn(),
    supportsOnGrab: false,
    supportsOnReleaseImport: false,
    supportsOnUpgrade: false,
    supportsOnRename: false,
    supportsOnAuthorAdded: false,
    supportsOnAuthorDelete: false,
    supportsOnBookDelete: false,
    supportsOnBookFileDelete: false,
    supportsOnBookFileDeleteForUpgrade: false,
    supportsOnHealthIssue: false,
    supportsOnApplicationUpdate: false,
    supportsOnDownloadFailure: false,
    supportsOnImportFailure: false,
    supportsOnBookRetag: false,
    ...overrides,
  };
}

function inMemoryRepository(): IProviderRepository<NotificationDefinition<NullConfig>> & {
  store: Map<number, NotificationDefinition<NullConfig>>;
} {
  const store = new Map<number, NotificationDefinition<NullConfig>>();
  let nextId = 1;

  return {
    store,
    all: () => [...store.values()],
    find: (id) => store.get(id),
    get: (id) => {
      const found = store.get(id);
      if (!found) throw new Error(`not found: ${id}`);
      return found;
    },
    getMany: (ids) => ids.map((id) => store.get(id)!).filter(Boolean),
    insert: (model) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model) => {
      store.set(model.id, model);
      return model;
    },
    updateMany: (models) => {
      for (const m of models) store.set(m.id, m);
    },
    upsert: (model) => {
      if (model.id === 0) {
        const withId = { ...model, id: nextId++ };
        store.set(withId.id, withId);
        return withId;
      }
      store.set(model.id, model);
      return model;
    },
    delete: (id) => {
      store.delete(id);
    },
    deleteMany: (ids) => {
      for (const id of ids) store.delete(id);
    },
    count: () => store.size,
  };
}

function fakeStatusService(
  overrides: Partial<INotificationStatusService> = {}
): INotificationStatusService & {
  recordSuccess: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
} {
  return {
    getBlockedProviders: () => [],
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    ...overrides,
  } as never;
}

describe("NotificationFactory", () => {
  it("active() ANDs the base's validity filter with .enable (unlike the base ProviderFactory.active(), which ignores .enable)", () => {
    const repo = inMemoryRepository();
    repo.insert(
      createNotificationDefinition<NullConfig>({
        name: "ValidAndEnabled",
        implementation: "Mock",
        onGrab: true,
        settings: NULL_CONFIG_INSTANCE,
      })
    );
    repo.insert(
      createNotificationDefinition<NullConfig>({
        name: "ValidButDisabled",
        implementation: "Mock",
        settings: NULL_CONFIG_INSTANCE,
        // every OnX flag left false -> computeNotificationDefinitionEnable() is false
      })
    );

    const factory = new NotificationFactory(
      fakeStatusService(),
      repo,
      [],
      new Map([["mock", () => fakeNotification("Mock")]])
    );

    const available = factory.getAvailableProviders();
    expect(available.map((n) => n.definition.name)).toEqual(["ValidAndEnabled"]);
  });

  it("onGrabEnabled() returns only definitions with onGrab set, matching NotificationFactory.OnGrabEnabled()", () => {
    const repo = inMemoryRepository();
    repo.insert(
      createNotificationDefinition<NullConfig>({
        name: "Grabber",
        implementation: "Mock",
        onGrab: true,
        settings: NULL_CONFIG_INSTANCE,
      })
    );
    repo.insert(
      createNotificationDefinition<NullConfig>({
        name: "Renamer",
        implementation: "Mock",
        onRename: true,
        settings: NULL_CONFIG_INSTANCE,
      })
    );

    const factory = new NotificationFactory(
      fakeStatusService(),
      repo,
      [],
      new Map([["mock", () => fakeNotification("Mock")]])
    );

    expect(factory.onGrabEnabled(false).map((n) => n.definition.name)).toEqual(["Grabber"]);
  });

  it("onBookFileDeleteForUpgradeEnabled() filters on OnBookFileDeleteForUpgrade specifically, not OnBookFileDelete", () => {
    const repo = inMemoryRepository();
    repo.insert(
      createNotificationDefinition<NullConfig>({
        name: "UpgradeOnly",
        implementation: "Mock",
        onBookFileDelete: true,
        onBookFileDeleteForUpgrade: true,
        settings: NULL_CONFIG_INSTANCE,
      })
    );
    repo.insert(
      createNotificationDefinition<NullConfig>({
        name: "DeleteOnly",
        implementation: "Mock",
        onBookFileDelete: true,
        onBookFileDeleteForUpgrade: false,
        settings: NULL_CONFIG_INSTANCE,
      })
    );

    const factory = new NotificationFactory(
      fakeStatusService(),
      repo,
      [],
      new Map([["mock", () => fakeNotification("Mock")]])
    );

    expect(
      factory
        .onBookFileDeleteEnabled(false)
        .map((n) => n.definition.name)
        .sort()
    ).toEqual(["DeleteOnly", "UpgradeOnly"]);
    expect(factory.onBookFileDeleteForUpgradeEnabled(false).map((n) => n.definition.name)).toEqual([
      "UpgradeOnly",
    ]);
  });

  it("filterBlockedNotifications drops notifications whose status is currently disabled, matching NotificationFactory.FilterBlockedNotifications()", () => {
    const repo = inMemoryRepository();
    const blockedDef = repo.insert(
      createNotificationDefinition<NullConfig>({
        name: "Blocked",
        implementation: "Mock",
        onGrab: true,
        settings: NULL_CONFIG_INSTANCE,
      })
    );
    repo.insert(
      createNotificationDefinition<NullConfig>({
        name: "Healthy",
        implementation: "Mock",
        onGrab: true,
        settings: NULL_CONFIG_INSTANCE,
      })
    );

    const statusService = fakeStatusService({
      getBlockedProviders: () => [
        createNotificationStatus({
          providerId: blockedDef.id,
          disabledTill: new Date(Date.now() + 60_000).toISOString(),
        }),
      ],
    });

    const factory = new NotificationFactory(
      statusService,
      repo,
      [],
      new Map([["mock", () => fakeNotification("Mock")]])
    );

    expect(factory.onGrabEnabled(true).map((n) => n.definition.name)).toEqual(["Healthy"]);
    expect(
      factory
        .onGrabEnabled(false)
        .map((n) => n.definition.name)
        .sort()
    ).toEqual(["Blocked", "Healthy"]);
  });

  it("setProviderCharacteristicsFor() stamps every SupportsOnX flag from the live provider instance", () => {
    const repo = inMemoryRepository();
    const provider = fakeNotification("Mock", { supportsOnGrab: true, supportsOnBookRetag: true });

    const factory = new NotificationFactory(
      fakeStatusService(),
      repo,
      [provider],
      new Map([["mock", () => provider]])
    );

    const definition = createNotificationDefinition<NullConfig>({ implementation: "Mock" });
    factory.setProviderCharacteristics(definition);

    expect(definition.supportsOnGrab).toBe(true);
    expect(definition.supportsOnBookRetag).toBe(true);
    expect(definition.supportsOnRename).toBe(false);
  });

  it("test() records success on the status service when the definition has a real id and the result is valid", async () => {
    const repo = inMemoryRepository();
    const provider = fakeNotification("Mock");
    const statusService = fakeStatusService();

    const factory = new NotificationFactory(
      statusService,
      repo,
      [provider],
      new Map([["mock", () => provider]])
    );

    const definition = createNotificationDefinition<NullConfig>({ id: 5, implementation: "Mock" });
    await factory.test(definition);

    expect(statusService.recordSuccess).toHaveBeenCalledWith(5);
    expect(statusService.recordFailure).not.toHaveBeenCalled();
  });

  it("test() records failure when the result is invalid", async () => {
    const repo = inMemoryRepository();
    const provider = fakeNotification("Mock", {
      test: vi.fn(async () => ({
        isValid: false,
        hasWarnings: false,
        errors: [{ propertyName: "x", errorMessage: "bad" }],
      })),
    });
    const statusService = fakeStatusService();

    const factory = new NotificationFactory(
      statusService,
      repo,
      [provider],
      new Map([["mock", () => provider]])
    );

    const definition = createNotificationDefinition<NullConfig>({ id: 5, implementation: "Mock" });
    await factory.test(definition);

    expect(statusService.recordFailure).toHaveBeenCalledWith(5);
  });

  it("test() does NOT record success/failure when the definition id is 0 (not-yet-saved), matching the C# early return", async () => {
    const repo = inMemoryRepository();
    const provider = fakeNotification("Mock");
    const statusService = fakeStatusService();

    const factory = new NotificationFactory(
      statusService,
      repo,
      [provider],
      new Map([["mock", () => provider]])
    );

    await factory.test(createNotificationDefinition<NullConfig>({ id: 0, implementation: "Mock" }));

    expect(statusService.recordSuccess).not.toHaveBeenCalled();
    expect(statusService.recordFailure).not.toHaveBeenCalled();
  });
});
