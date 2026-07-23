import { describe, expect, it } from "vitest";
import { reconfigureSentry } from "../reconfigureSentry.js";

/**
 * ReconfigureSentry has no portable behavior in this port -- see
 * reconfigureSentry.ts's doc comment for why (no Sentry SDK/NLog target
 * exists to update). This just pins the documented no-op contract: calling
 * it never throws and has no observable side effect, so a future real
 * integration can replace the function body without this test needing to
 * change its call site expectations.
 */
describe("reconfigureSentry", () => {
  it("is a no-op that accepts the ported scope-info shape without throwing", () => {
    expect(() =>
      reconfigureSentry({
        databaseVersion: "3.45.1",
        databaseMigration: 40,
        branch: "develop",
        platformName: "win32",
        platformVersion: "10.0.26200",
      })
    ).not.toThrow();
  });

  it("returns undefined", () => {
    expect(
      reconfigureSentry({
        databaseVersion: "3.45.1",
        databaseMigration: 40,
        branch: "develop",
        platformName: "win32",
        platformVersion: "10.0.26200",
      })
    ).toBeUndefined();
  });
});
