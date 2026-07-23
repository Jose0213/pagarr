import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "../User.js";
import type { IUserRepository } from "../UserRepository.js";
import { UserService } from "../UserService.js";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function inMemoryUserRepository(): IUserRepository & { store: Map<number, User> } {
  const store = new Map<number, User>();
  let nextId = 1;

  return {
    store,
    all: () => [...store.values()],
    find: (id) => store.get(id),
    get: (id) => store.get(id)!,
    insert: (model) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model) => {
      store.set(model.id, model);
      return model;
    },
    upsert: (model) => {
      const withId = model.id === 0 ? { ...model, id: nextId++ } : model;
      store.set(withId.id, withId);
      return withId;
    },
    delete: (id) => {
      store.delete(id);
    },
    single: () => {
      const all = [...store.values()];
      if (all.length !== 1) {
        throw new Error("expected exactly one");
      }
      return all[0]!;
    },
    singleOrDefault: () => {
      const all = [...store.values()];
      return all[0];
    },
    findUserByUsername: (username) => [...store.values()].find((u) => u.username === username),
    findUserByIdentifier: (identifier) =>
      [...store.values()].find((u) => u.identifier === identifier),
  };
}

/** Translated concepts from NzbDrone.Core.Test's (non-existent as a dedicated fixture) UserService behavior, ported from the real UserService.cs source read directly. */
describe("UserService", () => {
  let repo: ReturnType<typeof inMemoryUserRepository>;
  let service: UserService;

  beforeEach(() => {
    repo = inMemoryUserRepository();
    service = new UserService(repo);
  });

  it("add() generates an identifier, lowercases the username, and SHA-256 hashes the password", () => {
    const user = service.add("AdminUser", "hunter2");

    expect(user.identifier).toMatch(/^[0-9a-f-]{36}$/i);
    expect(user.username).toBe("adminuser");
    expect(user.password).toBe(sha256("hunter2"));
  });

  it("findUser() returns the single stored user (or undefined)", () => {
    expect(service.findUser()).toBeUndefined();

    service.add("zay", "pw");
    expect(service.findUser()?.username).toBe("zay");
  });

  it("upsert() adds a new user when none exists yet", () => {
    const user = service.upsert("zay", "pw");
    expect(user.username).toBe("zay");
    expect(user.password).toBe(sha256("pw"));
  });

  it("upsert() updates username/password when a user already exists", () => {
    service.add("zay", "oldpw");

    const updated = service.upsert("Zay2", "newpw");

    expect(updated.username).toBe("zay2");
    expect(updated.password).toBe(sha256("newpw"));
  });

  it("findUserByCredentials() returns the user when username+password match", () => {
    service.add("zay", "correct-password");

    const found = service.findUserByCredentials("zay", "correct-password");
    expect(found?.username).toBe("zay");
  });

  it("findUserByCredentials() is case-insensitive on username, matching ToLowerInvariant()", () => {
    service.add("zay", "pw123");

    expect(service.findUserByCredentials("ZAY", "pw123")?.username).toBe("zay");
  });

  it("findUserByCredentials() returns undefined for a wrong password", () => {
    service.add("zay", "correct-password");

    expect(service.findUserByCredentials("zay", "wrong-password")).toBeUndefined();
  });

  it("findUserByCredentials() returns undefined for a nonexistent username", () => {
    expect(service.findUserByCredentials("ghost", "pw")).toBeUndefined();
  });

  it("findUserByCredentials() returns undefined for blank username or password, matching IsNullOrWhiteSpace guard", () => {
    service.add("zay", "pw");

    expect(service.findUserByCredentials("", "pw")).toBeUndefined();
    expect(service.findUserByCredentials("zay", "")).toBeUndefined();
    expect(service.findUserByCredentials("   ", "pw")).toBeUndefined();
  });

  it("findUserByIdentifier() delegates to the repository's identifier lookup", () => {
    const created = service.add("zay", "pw");
    expect(service.findUserByIdentifier(created.identifier)?.username).toBe("zay");
    expect(service.findUserByIdentifier("nonexistent-guid")).toBeUndefined();
  });

  it("update() persists an already-fetched user", () => {
    const created = service.add("zay", "pw");
    const updated = service.update({ ...created, username: "renamed" });

    expect(updated.username).toBe("renamed");
    expect(repo.get(created.id).username).toBe("renamed");
  });
});
