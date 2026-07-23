import { describe, expect, it } from "vitest";
import { newAuthor, newBook, type Author, type Book } from "../../books/models.js";
import { applicationUpdateMessageToString } from "../ApplicationUpdateMessage.js";
import { authorDeleteMessageToString, createAuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import { bookDeleteMessageToString, createBookDeleteMessage } from "../BookDeleteMessage.js";
import { bookDownloadMessageToString } from "../BookDownloadMessage.js";
import { bookFileDeleteMessageToString } from "../BookFileDeleteMessage.js";
import { bookRetagMessageToString } from "../BookRetagMessage.js";
import { downloadFailedMessageToString } from "../DownloadFailedMessage.js";
import { grabMessageToString } from "../GrabMessage.js";

function author(overrides: Partial<Author> = {}): Author {
  return { ...newAuthor(), id: 1, ...overrides };
}

function book(overrides: Partial<Book> = {}): Book {
  return { ...newBook(), id: 1, ...overrides };
}

describe("ApplicationUpdateMessage", () => {
  it("toString() returns NewVersion.ToString(), matching the real C# override", () => {
    const message = { message: "updated", previousVersion: "1.0.0", newVersion: "2.0.0" };
    expect(applicationUpdateMessageToString(message)).toBe("2.0.0");
  });
});

describe("AuthorDeleteMessage", () => {
  it("createAuthorDeleteMessage() builds the deletedFilesMessage/message exactly like the C# constructor when deleteFiles is true", () => {
    const message = createAuthorDeleteMessage(author(), "Stephen King", true);

    expect(message.deletedFilesMessage).toBe("Author removed and all files were deleted");
    expect(message.message).toBe("Stephen King - Author removed and all files were deleted");
    expect(authorDeleteMessageToString(message)).toBe(message.message);
  });

  it("createAuthorDeleteMessage() uses the not-deleted message when deleteFiles is false", () => {
    const message = createAuthorDeleteMessage(author(), "Stephen King", false);

    expect(message.deletedFilesMessage).toBe("Author removed, files were not deleted");
    expect(message.message).toBe("Stephen King - Author removed, files were not deleted");
  });
});

describe("BookDeleteMessage", () => {
  it("createBookDeleteMessage() builds the message from Book.Title exactly like the C# constructor", () => {
    const message = createBookDeleteMessage(book({ title: "The Shining" }), true);

    expect(message.deletedFilesMessage).toBe("Book removed and all files were deleted");
    expect(message.message).toBe("The Shining - Book removed and all files were deleted");
    expect(bookDeleteMessageToString(message)).toBe(message.message);
  });

  it("createBookDeleteMessage() uses the not-deleted message when deleteFiles is false", () => {
    const message = createBookDeleteMessage(book({ title: "It" }), false);
    expect(message.message).toBe("It - Book removed, files were not deleted");
  });
});

describe("message ToString() overrides", () => {
  it("GrabMessage/BookDownloadMessage/BookFileDeleteMessage/BookRetagMessage/DownloadFailedMessage all return the Message field verbatim", () => {
    expect(grabMessageToString({ message: "grabbed" } as never)).toBe("grabbed");
    expect(bookDownloadMessageToString({ message: "downloaded" } as never)).toBe("downloaded");
    expect(bookFileDeleteMessageToString({ message: "deleted" } as never)).toBe("deleted");
    expect(bookRetagMessageToString({ message: "retagged" } as never)).toBe("retagged");
    expect(downloadFailedMessageToString({ message: "failed" } as never)).toBe("failed");
  });
});
