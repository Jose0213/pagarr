import { describe, expect, it } from "vitest";
import { newEntityHistory, EntityHistoryEventType } from "../entityHistory.js";

describe("newEntityHistory", () => {
  it("defaults to Unknown eventType, empty data, null downloadId", () => {
    const history = newEntityHistory();

    expect(history.eventType).toBe(EntityHistoryEventType.Unknown);
    expect(history.data).toEqual({});
    expect(history.downloadId).toBeNull();
    expect(history.id).toBe(0);
  });

  it("applies overrides", () => {
    const history = newEntityHistory({ authorId: 5, bookId: 9, sourceTitle: "x" });

    expect(history.authorId).toBe(5);
    expect(history.bookId).toBe(9);
    expect(history.sourceTitle).toBe("x");
  });
});
