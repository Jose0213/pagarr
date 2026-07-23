import { describe, expect, it } from "vitest";
import { MonitorNewBookService } from "../monitorNewBookService.js";
import { NewItemMonitorTypes, newBook, type Book } from "../models.js";

function book(overrides: Partial<Book> = {}): Book {
  return { ...newBook(), ...overrides };
}

describe("MonitorNewBookService", () => {
  const service = new MonitorNewBookService();

  it("None: never monitors", () => {
    expect(service.shouldMonitorNewBook(book(), [], NewItemMonitorTypes.None)).toBe(false);
    expect(
      service.shouldMonitorNewBook(
        book({ releaseDate: "2099-01-01T00:00:00.000Z" }),
        [],
        NewItemMonitorTypes.None
      )
    ).toBe(false);
  });

  it("All: always monitors", () => {
    expect(service.shouldMonitorNewBook(book(), [], NewItemMonitorTypes.All)).toBe(true);
  });

  describe("New", () => {
    it("monitors when the added book releases on/after the latest existing book", () => {
      const existing = [
        book({ releaseDate: "2020-01-01T00:00:00.000Z" }),
        book({ releaseDate: "2021-01-01T00:00:00.000Z" }),
      ];

      expect(
        service.shouldMonitorNewBook(
          book({ releaseDate: "2021-06-01T00:00:00.000Z" }),
          existing,
          NewItemMonitorTypes.New
        )
      ).toBe(true);

      expect(
        service.shouldMonitorNewBook(
          book({ releaseDate: "2021-01-01T00:00:00.000Z" }),
          existing,
          NewItemMonitorTypes.New
        )
      ).toBe(true); // equal to latest: still true (>=)
    });

    it("does not monitor when the added book releases before the latest existing book", () => {
      const existing = [
        book({ releaseDate: "2020-01-01T00:00:00.000Z" }),
        book({ releaseDate: "2021-01-01T00:00:00.000Z" }),
      ];

      expect(
        service.shouldMonitorNewBook(
          book({ releaseDate: "2019-01-01T00:00:00.000Z" }),
          existing,
          NewItemMonitorTypes.New
        )
      ).toBe(false);
    });

    it("treats missing release dates as DateTime.MinValue (existing books with no date, or the added book with no date)", () => {
      const existingNoDates = [book({ releaseDate: null }), book({ releaseDate: null })];

      // Any real release date is >= MinValue, so a dated new book is monitored.
      expect(
        service.shouldMonitorNewBook(
          book({ releaseDate: "2020-01-01T00:00:00.000Z" }),
          existingNoDates,
          NewItemMonitorTypes.New
        )
      ).toBe(true);

      // An undated new book compared against dated existing books: MinValue < any real date -> false.
      const existingDated = [book({ releaseDate: "2020-01-01T00:00:00.000Z" })];
      expect(
        service.shouldMonitorNewBook(
          book({ releaseDate: null }),
          existingDated,
          NewItemMonitorTypes.New
        )
      ).toBe(false);
    });

    it("with no existing books, the latest is MinValue so any real release date monitors", () => {
      expect(
        service.shouldMonitorNewBook(
          book({ releaseDate: "2020-01-01T00:00:00.000Z" }),
          [],
          NewItemMonitorTypes.New
        )
      ).toBe(true);
    });
  });
});
