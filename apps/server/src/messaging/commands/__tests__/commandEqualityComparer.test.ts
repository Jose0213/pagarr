import { describe, expect, it } from "vitest";
import { Command } from "../command.js";
import { CommandEqualityComparer } from "../commandEqualityComparer.js";
import { CommandTrigger } from "../commandTrigger.js";

/** Ported from NzbDrone.Core.Test/Messaging/Commands/CommandEqualityComparerFixture.cs. */

class NoPropsCommand extends Command {}

class BookSearchCommand extends Command {
  bookIds: number[] | null = null;

  constructor(bookIds: number[] | null = null) {
    super();
    this.bookIds = bookIds;
  }
}

class AuthorSearchCommand extends Command {
  authorId: number | null = null;
}

class RssSyncCommand extends Command {}
class ApplicationUpdateCommand extends Command {}

interface ManualImportFile {
  path: string;
  quality: string;
}

class ManualImportCommand extends Command {
  files: ManualImportFile[] = [];
}

describe("CommandEqualityComparer", () => {
  const comparer = CommandEqualityComparer.instance;

  it("should_return_true_when_there_are_no_properties", () => {
    const command1 = new NoPropsCommand();
    const command2 = new NoPropsCommand();

    expect(comparer.equals(command1, command2)).toBe(true);
  });

  it("should_return_true_when_single_property_matches", () => {
    const command1 = new BookSearchCommand([1]);
    const command2 = new BookSearchCommand([1]);

    expect(comparer.equals(command1, command2)).toBe(true);
  });

  it("should_return_false_when_single_property_doesnt_match", () => {
    const command1 = new BookSearchCommand([1]);
    const command2 = new BookSearchCommand([2]);

    expect(comparer.equals(command1, command2)).toBe(false);
  });

  it("should_return_false_when_only_one_has_properties", () => {
    const command1 = new AuthorSearchCommand();
    const command2 = new AuthorSearchCommand();
    command2.authorId = 2;

    expect(comparer.equals(command1, command2)).toBe(false);
  });

  it("should_return_false_when_only_one_has_null_property", () => {
    const command1 = new BookSearchCommand(null);
    const command2 = new BookSearchCommand([]);

    expect(comparer.equals(command1, command2)).toBe(false);
  });

  it("should_return_false_when_commands_are_diffrent_types", () => {
    expect(comparer.equals(new RssSyncCommand(), new ApplicationUpdateCommand())).toBe(false);
  });

  it("should_return_false_when_commands_list_are_different_lengths", () => {
    const command1 = new BookSearchCommand([1]);
    const command2 = new BookSearchCommand([1, 2]);

    expect(comparer.equals(command1, command2)).toBe(false);
  });

  it("should_return_false_when_commands_list_dont_match", () => {
    const command1 = new BookSearchCommand([1]);
    const command2 = new BookSearchCommand([2]);

    expect(comparer.equals(command1, command2)).toBe(false);
  });

  it("should_return_true_when_commands_list_for_non_primitive_type_match", () => {
    const files1: ManualImportFile[] = [
      { path: "C:\\Tesst\\a", quality: "MP3" },
      { path: "C:\\Tesst\\b", quality: "FLAC" },
    ];
    const files2 = JSON.parse(JSON.stringify(files1)) as ManualImportFile[];

    const command1 = new ManualImportCommand();
    command1.files = files1;
    const command2 = new ManualImportCommand();
    command2.files = files2;

    expect(comparer.equals(command1, command2)).toBe(true);
  });

  it("should_return_false_when_commands_list_for_non_primitive_type_dont_match", () => {
    const command1 = new ManualImportCommand();
    command1.files = [{ path: "C:\\Tesst\\a", quality: "MP3" }];
    const command2 = new ManualImportCommand();
    command2.files = [{ path: "C:\\Tesst\\b", quality: "FLAC" }];

    expect(comparer.equals(command1, command2)).toBe(false);
  });

  it("ignores id and base Command fields when comparing", () => {
    const command1 = new BookSearchCommand([1]);
    const command2 = new BookSearchCommand([1]);
    command2.lastExecutionTime = new Date().toISOString();
    command2.trigger =
      command1.trigger === CommandTrigger.Unspecified
        ? CommandTrigger.Manual
        : CommandTrigger.Unspecified;

    expect(comparer.equals(command1, command2)).toBe(true);
  });
});
