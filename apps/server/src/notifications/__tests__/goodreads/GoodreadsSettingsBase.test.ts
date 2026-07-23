import { describe, expect, it } from "vitest";
import {
  createGoodreadsSettingsBaseFields,
  isGoodreadsSettingsValid,
  validateGoodreadsSettingsBase,
} from "../../goodreads/GoodreadsSettingsBase.js";

describe("createGoodreadsSettingsBaseFields", () => {
  it("defaults signIn to startOAuth and exposes the fixed Goodreads/Servarr URLs", () => {
    const fields = createGoodreadsSettingsBaseFields();

    expect(fields.signIn).toBe("startOAuth");
    expect(fields.signingUrl).toBe("https://auth.servarr.com/v1/goodreads/sign");
    expect(fields.oAuthUrl).toBe("https://www.goodreads.com/oauth/authorize");
    expect(fields.oAuthRequestTokenUrl).toBe("https://www.goodreads.com/oauth/request_token");
    expect(fields.oAuthAccessTokenUrl).toBe("https://www.goodreads.com/oauth/access_token");
  });
});

describe("isGoodreadsSettingsValid", () => {
  it("is true only when accessTokenSecret is non-blank", () => {
    const base = createGoodreadsSettingsBaseFields();
    expect(isGoodreadsSettingsValid({ ...base, accessTokenSecret: "secret" } as never)).toBe(true);
    expect(isGoodreadsSettingsValid({ ...base, accessTokenSecret: null } as never)).toBe(false);
    expect(isGoodreadsSettingsValid({ ...base, accessTokenSecret: "  " } as never)).toBe(false);
  });
});

describe("validateGoodreadsSettingsBase", () => {
  it("requires both accessToken and accessTokenSecret", () => {
    const base = createGoodreadsSettingsBaseFields();
    const errors = validateGoodreadsSettingsBase(base as never);

    expect(errors.map((e) => e.propertyName)).toEqual(
      expect.arrayContaining(["accessToken", "accessTokenSecret"])
    );
  });

  it("passes when both are set", () => {
    const base = {
      ...createGoodreadsSettingsBaseFields(),
      accessToken: "at",
      accessTokenSecret: "ats",
    };
    expect(validateGoodreadsSettingsBase(base as never)).toHaveLength(0);
  });
});
