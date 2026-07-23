import { describe, expect, it, vi } from "vitest";
import {
  BlocklistSpecification,
  type BlocklistServiceLike,
} from "../../specifications/blocklistSpecification.js";
import { makeAuthor, makeRemoteBook } from "../testFixtures.js";

/** No dedicated C# fixture exists for BlocklistSpecification -- new tests covering its documented delegation to IBlocklistService.Blocklisted. */
describe("BlocklistSpecification", () => {
  it("accepts when the blocklist service reports not blocklisted", () => {
    const blocklistService: BlocklistServiceLike = { blocklisted: vi.fn(() => false) };
    const subject = new BlocklistSpecification(blocklistService);
    const remoteBook = makeRemoteBook({ author: makeAuthor({ id: 42 }) });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
    expect(blocklistService.blocklisted).toHaveBeenCalledWith(42, remoteBook.release);
  });

  it("rejects when the blocklist service reports blocklisted", () => {
    const blocklistService: BlocklistServiceLike = { blocklisted: vi.fn(() => true) };
    const subject = new BlocklistSpecification(blocklistService);
    const remoteBook = makeRemoteBook();

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });
});
