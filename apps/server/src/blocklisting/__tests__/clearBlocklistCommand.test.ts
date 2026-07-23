import { describe, expect, it } from "vitest";
import { ClearBlocklistCommand } from "../clearBlocklistCommand.js";

describe("ClearBlocklistCommand", () => {
  it("always sends updates to client", () => {
    expect(new ClearBlocklistCommand().sendUpdatesToClient).toBe(true);
  });

  it("derives its command name as 'ClearBlocklist'", () => {
    expect(new ClearBlocklistCommand().name).toBe("ClearBlocklist");
  });
});
