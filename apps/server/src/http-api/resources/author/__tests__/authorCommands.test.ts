import { describe, expect, it } from "vitest";
import { BulkMoveAuthorCommand, MoveAuthorCommand } from "../authorCommands.js";

describe("MoveAuthorCommand", () => {
  it("derives its name from the class name (Command's ctor logic), stripping 'Command'", () => {
    const command = new MoveAuthorCommand();
    expect(command.name).toBe("MoveAuthor");
  });

  it("overrides sendUpdatesToClient and requiresDiskAccess to true", () => {
    const command = new MoveAuthorCommand();
    expect(command.sendUpdatesToClient).toBe(true);
    expect(command.requiresDiskAccess).toBe(true);
  });

  it("carries authorId/sourcePath/destinationPath fields", () => {
    const command = new MoveAuthorCommand();
    command.authorId = 42;
    command.sourcePath = "/old";
    command.destinationPath = "/new";

    expect(command.authorId).toBe(42);
    expect(command.sourcePath).toBe("/old");
    expect(command.destinationPath).toBe("/new");
  });
});

describe("BulkMoveAuthorCommand", () => {
  it("derives its name from the class name", () => {
    const command = new BulkMoveAuthorCommand();
    expect(command.name).toBe("BulkMoveAuthor");
  });

  it("overrides sendUpdatesToClient and requiresDiskAccess to true", () => {
    const command = new BulkMoveAuthorCommand();
    expect(command.sendUpdatesToClient).toBe(true);
    expect(command.requiresDiskAccess).toBe(true);
  });

  it("carries a list of BulkMoveAuthor entries plus a destination root folder", () => {
    const command = new BulkMoveAuthorCommand();
    command.destinationRootFolder = "/books";
    command.author = [
      { authorId: 1, sourcePath: "/a" },
      { authorId: 2, sourcePath: "/b" },
    ];

    expect(command.destinationRootFolder).toBe("/books");
    expect(command.author).toHaveLength(2);
  });
});
