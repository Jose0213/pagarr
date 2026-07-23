import { describe, expect, it } from "vitest";
import { ConfigContractNotFoundException } from "../ConfigContractNotFoundException.js";

describe("ConfigContractNotFoundException", () => {
  it("formats the message with the contract name, matching the C# original", () => {
    const err = new ConfigContractNotFoundException("TorznabSettings");
    expect(err.message).toBe("Couldn't find config contract TorznabSettings");
    expect(err.name).toBe("ConfigContractNotFoundException");
  });
});
