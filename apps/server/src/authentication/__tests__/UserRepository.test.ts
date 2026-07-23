import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { createUser } from "../User.js";
import { UserRepository } from "../UserRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "Users" (
      "Id" INTEGER PRIMARY KEY,
      "Identifier" TEXT NOT NULL UNIQUE,
      "Username" TEXT NOT NULL UNIQUE,
      "Password" TEXT NOT NULL
    );
  `);
  return new Database("Test", sqlite);
}

describe("UserRepository", () => {
  let db: IDatabase;
  let repo: UserRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new UserRepository(db);
  });

  it("round-trips identifier/username/password through insert + get", () => {
    const inserted = repo.insert(
      createUser({ identifier: "abc-123", username: "admin", password: "hashedpw" })
    );
    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.identifier).toBe("abc-123");
    expect(stored.username).toBe("admin");
    expect(stored.password).toBe("hashedpw");
  });

  it("findUserByUsername() looks up by the unique Username column, matching Query(x => x.Username == username).SingleOrDefault()", () => {
    repo.insert(createUser({ identifier: "id-1", username: "zay", password: "pw" }));
    expect(repo.findUserByUsername("zay")?.identifier).toBe("id-1");
    expect(repo.findUserByUsername("missing")).toBeUndefined();
  });

  it("findUserByIdentifier() looks up by the unique Identifier column, matching Query(x => x.Identifier == identifier).SingleOrDefault()", () => {
    repo.insert(createUser({ identifier: "guid-xyz", username: "zay", password: "pw" }));
    expect(repo.findUserByIdentifier("guid-xyz")?.username).toBe("zay");
    expect(repo.findUserByIdentifier("nope")).toBeUndefined();
  });

  it("single()/singleOrDefault() reflect the single-user table contract", () => {
    expect(repo.singleOrDefault()).toBeUndefined();

    repo.insert(createUser({ identifier: "id-1", username: "zay", password: "pw" }));
    expect(repo.single().username).toBe("zay");
    expect(repo.singleOrDefault()?.username).toBe("zay");
  });
});
