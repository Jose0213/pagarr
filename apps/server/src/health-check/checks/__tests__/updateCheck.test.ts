import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { UpdateCheck } from "../updateCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/UpdateCheckFixture.cs. */

const STARTUP_FOLDER = "/NzbDrone";
// Built via node:path.join, matching UpdateCheck.check()'s own
// `join(startupFolder, "UI")` -- on Windows this yields a backslash-joined
// path, so a hardcoded forward-slash string would never match the
// diskProvider.folderWritable(uiFolder) call the check actually makes.
const UI_FOLDER = join(STARTUP_FOLDER, "UI");

describe("UpdateCheck", () => {
  it("should_return_error_when_app_folder_is_write_protected_and_update_automatically_is_enabled", async () => {
    const check = new UpdateCheck(
      { folderWritable: (p) => p !== STARTUP_FOLDER },
      STARTUP_FOLDER,
      { availableUpdate: () => null },
      { updateAutomatically: true, updateMechanism: "BuiltIn" },
      { isDocker: false },
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Error);
  });

  it("should_return_error_when_ui_folder_is_write_protected_and_update_automatically_is_enabled", async () => {
    const check = new UpdateCheck(
      { folderWritable: (p) => p !== UI_FOLDER },
      STARTUP_FOLDER,
      { availableUpdate: () => null },
      { updateAutomatically: true, updateMechanism: "BuiltIn" },
      { isDocker: false },
      new NullLocalizationService()
    );

    expect((await check.check()).type).toBe(HealthCheckResult.Error);
  });

  it("should_not_return_error_when_app_folder_is_write_protected_and_external_script_enabled", async () => {
    let folderWritableCalled = false;
    const check = new UpdateCheck(
      {
        folderWritable: () => {
          folderWritableCalled = true;
          return false;
        },
      },
      STARTUP_FOLDER,
      { availableUpdate: () => null },
      { updateAutomatically: true, updateMechanism: "Script" },
      { isDocker: false },
      new NullLocalizationService()
    );

    const result = await check.check();

    expect(result.type).toBe(HealthCheckResult.Ok);
    expect(folderWritableCalled).toBe(false);
  });

  it("does not check writability at all when updateAutomatically is disabled", async () => {
    let folderWritableCalled = false;
    const check = new UpdateCheck(
      {
        folderWritable: () => {
          folderWritableCalled = true;
          return false;
        },
      },
      STARTUP_FOLDER,
      { availableUpdate: () => null },
      { updateAutomatically: false, updateMechanism: "BuiltIn" },
      { isDocker: false },
      new NullLocalizationService()
    );

    const result = await check.check();

    expect(result.type).toBe(HealthCheckResult.Ok);
    expect(folderWritableCalled).toBe(false);
  });

  it("does not check writability at all when running in Docker", async () => {
    let folderWritableCalled = false;
    const check = new UpdateCheck(
      {
        folderWritable: () => {
          folderWritableCalled = true;
          return false;
        },
      },
      STARTUP_FOLDER,
      { availableUpdate: () => null },
      { updateAutomatically: true, updateMechanism: "BuiltIn" },
      { isDocker: true },
      new NullLocalizationService()
    );

    const result = await check.check();

    expect(result.type).toBe(HealthCheckResult.Ok);
    expect(folderWritableCalled).toBe(false);
  });
});
