import { describe, expect, it, vi } from "vitest";
import { createProviderDefinition, type ProviderDefinition } from "../ProviderDefinition.js";
import { ProviderFactory, type ProviderFactoryEventAggregator } from "../ProviderFactory.js";
import type { IProvider } from "../IProvider.js";
import type { IProviderConfig, ValidationResult } from "../IProviderConfig.js";
import type { IProviderRepository } from "../IProviderRepository.js";
import { ProviderMessage, ProviderMessageType } from "../ProviderMessage.js";

interface MockSettings extends IProviderConfig {
  isValid: boolean;
}

function validSettings(): MockSettings {
  return {
    isValid: true,
    validate: (): ValidationResult => ({ isValid: true, hasWarnings: false, errors: [] }),
  };
}

function invalidSettings(): MockSettings {
  return {
    isValid: false,
    validate: (): ValidationResult => ({
      isValid: false,
      hasWarnings: false,
      errors: [{ propertyName: "x", errorMessage: "bad" }],
    }),
  };
}

function fakeProvider(
  name: string,
  overrides: Partial<IProvider<MockSettings>> = {}
): IProvider<MockSettings> {
  return {
    name,
    configContract: "MockSettings",
    message: null,
    defaultDefinitions: [],
    definition: createProviderDefinition<MockSettings>({ name, implementation: name }),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    requestAction: vi.fn(),
    ...overrides,
  };
}

function inMemoryRepository(): IProviderRepository<ProviderDefinition<MockSettings>> & {
  store: Map<number, ProviderDefinition<MockSettings>>;
} {
  const store = new Map<number, ProviderDefinition<MockSettings>>();
  let nextId = 1;

  return {
    store,
    all: () => [...store.values()],
    find: (id) => store.get(id),
    get: (id) => {
      const found = store.get(id);
      if (!found) {
        throw new Error(`not found: ${id}`);
      }
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
      for (const m of models) {
        store.set(m.id, m);
      }
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
      for (const id of ids) {
        store.delete(id);
      }
    },
    count: () => store.size,
  };
}

function fakeEventAggregator(): ProviderFactoryEventAggregator & { events: unknown[] } {
  const events: unknown[] = [];
  return {
    events,
    publishEvent: (event) => {
      events.push(event);
    },
  };
}

describe("ProviderFactory", () => {
  it("getInstance() resolves via the explicit implementation-factory map (no reflection/DI)", () => {
    const provider = fakeProvider("MockProvider");
    const repo = inMemoryRepository();
    const factory = new ProviderFactory(
      repo,
      [provider],
      new Map([["mockprovider", () => fakeProvider("MockProvider")]])
    );

    const definition = createProviderDefinition<MockSettings>({
      id: 1,
      implementation: "MockProvider",
    });
    const instance = factory.getInstance(definition);

    expect(instance.name).toBe("MockProvider");
    expect(instance.definition).toBe(definition);
  });

  it("getInstance() throws for an unregistered implementation", () => {
    const factory = new ProviderFactory(inMemoryRepository(), [], new Map());
    expect(() =>
      factory.getInstance(createProviderDefinition({ implementation: "Ghost" }))
    ).toThrow(/Unknown provider implementation/);
  });

  it("getInstance() implementation lookup is case-insensitive, matching StringComparison.InvariantCultureIgnoreCase", () => {
    const factory = new ProviderFactory(
      inMemoryRepository(),
      [],
      new Map([["mockprovider", () => fakeProvider("MockProvider")]])
    );

    const instance = factory.getInstance(
      createProviderDefinition({ implementation: "MOCKPROVIDER" })
    );
    expect(instance.name).toBe("MockProvider");
  });

  it("setProviderCharacteristics() stamps implementationName and message from the live instance", () => {
    const message = new ProviderMessage("hello", ProviderMessageType.Warning);
    const provider = fakeProvider("MockProvider", { message });
    const factory = new ProviderFactory(
      inMemoryRepository(),
      [provider],
      new Map([["mockprovider", () => fakeProvider("MockProvider", { message })]])
    );

    const definition = createProviderDefinition<MockSettings>({ implementation: "MockProvider" });
    factory.setProviderCharacteristics(definition);

    expect(definition.implementationName).toBe("MockProvider");
    expect(definition.message).toBe(message);
  });

  it("active() filters on settings.validate().isValid only -- NOT on .enable (faithful to the real C# Active())", () => {
    const repo = inMemoryRepository();
    repo.insert(
      createProviderDefinition<MockSettings>({
        name: "ValidButDisabled",
        implementation: "Mock",
        enable: false,
        settings: validSettings(),
      })
    );
    repo.insert(
      createProviderDefinition<MockSettings>({
        name: "InvalidButEnabled",
        implementation: "Mock",
        enable: true,
        settings: invalidSettings(),
      })
    );

    const factory = new ProviderFactory(repo, [], new Map([["mock", () => fakeProvider("Mock")]]));

    const available = factory.getAvailableProviders();
    expect(available.map((p) => p.definition.name)).toEqual(["ValidButDisabled"]);
  });

  it("create() inserts and publishes a ProviderAddedEvent", () => {
    const repo = inMemoryRepository();
    const events = fakeEventAggregator();
    const factory = new ProviderFactory(repo, [], new Map(), events);

    const created = factory.create(
      createProviderDefinition<MockSettings>({ name: "New", implementation: "Mock" })
    );

    expect(created.id).toBeGreaterThan(0);
    expect(events.events).toHaveLength(1);
  });

  it("update()/updateMany() publish ProviderUpdatedEvent(s)", () => {
    const repo = inMemoryRepository();
    const events = fakeEventAggregator();
    const factory = new ProviderFactory(repo, [], new Map(), events);

    const a = factory.create(
      createProviderDefinition<MockSettings>({ name: "A", implementation: "Mock" })
    );
    const b = factory.create(
      createProviderDefinition<MockSettings>({ name: "B", implementation: "Mock" })
    );
    events.events.length = 0;

    factory.update({ ...a, name: "A2" });
    expect(events.events).toHaveLength(1);

    factory.updateMany([
      { ...a, name: "A3" },
      { ...b, name: "B2" },
    ]);
    expect(events.events).toHaveLength(3);
  });

  it("delete()/deleteMany() publish ProviderDeletedEvent(s)", () => {
    const repo = inMemoryRepository();
    const events = fakeEventAggregator();
    const factory = new ProviderFactory(repo, [], new Map(), events);

    const a = factory.create(
      createProviderDefinition<MockSettings>({ name: "A", implementation: "Mock" })
    );
    const b = factory.create(
      createProviderDefinition<MockSettings>({ name: "B", implementation: "Mock" })
    );
    events.events.length = 0;

    factory.delete(a.id);
    expect(events.events).toHaveLength(1);
    expect(repo.find(a.id)).toBeUndefined();

    factory.deleteMany([b.id]);
    expect(events.events).toHaveLength(2);
    expect(repo.find(b.id)).toBeUndefined();
  });

  it("exists()/find()/get()/getMany() delegate to the repository", () => {
    const repo = inMemoryRepository();
    const factory = new ProviderFactory(repo, [], new Map());
    const a = factory.create(
      createProviderDefinition<MockSettings>({ name: "A", implementation: "Mock" })
    );

    expect(factory.exists(a.id)).toBe(true);
    expect(factory.exists(99999)).toBe(false);
    expect(factory.find(a.id)?.name).toBe("A");
    expect(factory.get(a.id).name).toBe("A");
    expect(factory.getMany([a.id])).toHaveLength(1);
  });

  it("allForTag() filters definitions whose tags include the given tag id", () => {
    const repo = inMemoryRepository();
    const factory = new ProviderFactory(repo, [], new Map());
    factory.create(
      createProviderDefinition<MockSettings>({ name: "Tagged", implementation: "Mock", tags: [5] })
    );
    factory.create(
      createProviderDefinition<MockSettings>({ name: "Untagged", implementation: "Mock", tags: [] })
    );

    expect(factory.allForTag(5).map((d) => d.name)).toEqual(["Tagged"]);
  });

  it("test() delegates to getInstance(definition).test()", async () => {
    const provider = fakeProvider("Mock");
    const factory = new ProviderFactory(
      inMemoryRepository(),
      [provider],
      new Map([["mock", () => provider]])
    );

    const result = await factory.test(
      createProviderDefinition<MockSettings>({ implementation: "Mock" })
    );
    expect(result.isValid).toBe(true);
    expect(provider.test).toHaveBeenCalled();
  });

  it("requestAction() delegates to getInstance(definition).requestAction()", () => {
    const provider = fakeProvider("Mock");
    const factory = new ProviderFactory(
      inMemoryRepository(),
      [provider],
      new Map([["mock", () => provider]])
    );

    factory.requestAction(
      createProviderDefinition<MockSettings>({ implementation: "Mock" }),
      "stage1",
      { a: "b" }
    );
    expect(provider.requestAction).toHaveBeenCalledWith("stage1", { a: "b" });
  });

  it("getDefaultDefinitions() falls back to a fresh definition built from the provider's own name/configContract when DefaultDefinitions has no match", () => {
    const provider = fakeProvider("Mock");
    const factory = new ProviderFactory(inMemoryRepository(), [provider], new Map());

    const defaults = factory.getDefaultDefinitions();
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.implementation).toBe("Mock");
    expect(defaults[0]!.configContract).toBe("MockSettings");
  });

  it("getDefaultDefinitions() uses a matching DefaultDefinitions entry when present", () => {
    const preset = createProviderDefinition<MockSettings>({ name: "Mock", implementation: "Mock" });
    const provider = fakeProvider("Mock", { defaultDefinitions: [preset] });
    const factory = new ProviderFactory(inMemoryRepository(), [provider], new Map());

    const defaults = factory.getDefaultDefinitions();
    expect(defaults[0]).toBe(preset);
  });

  it("getPresetDefinitions() returns only named presets that aren't the provider's own default entry", () => {
    const named = createProviderDefinition<MockSettings>({
      name: "Preset A",
      implementation: "Mock",
    });
    const ownDefault = createProviderDefinition<MockSettings>({
      name: "Mock",
      implementation: "Mock",
    });
    const provider = fakeProvider("Mock", { defaultDefinitions: [named, ownDefault] });
    const factory = new ProviderFactory(inMemoryRepository(), [provider], new Map());

    const presets = factory.getPresetDefinitions(
      createProviderDefinition<MockSettings>({ implementation: "Mock" })
    );
    expect(presets).toEqual([named]);
  });

  it("initialize() removes stored definitions whose implementation has no registered factory", () => {
    const repo = inMemoryRepository();
    repo.insert(createProviderDefinition<MockSettings>({ name: "Orphan", implementation: "Gone" }));
    repo.insert(createProviderDefinition<MockSettings>({ name: "Kept", implementation: "Mock" }));

    const factory = new ProviderFactory(repo, [], new Map([["mock", () => fakeProvider("Mock")]]));
    factory.initialize();

    expect(repo.all().map((d) => d.name)).toEqual(["Kept"]);
  });
});
