import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { LocalizationService } from "../../../../localization/localizationService.js";
import { localizationController } from "../LocalizationController.js";

describe("localizationController", () => {
  it("GET / returns {Strings: {...}} with a PascalCase key, not {strings: {...}}", async () => {
    const localizationService = new LocalizationService();
    const router = localizationController({ localizationService });
    const app = express();
    app.use("/localization", router);

    const res = await request(app).get("/localization");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("Strings");
    expect(res.body).not.toHaveProperty("strings");
    expect(res.body.Strings["Cancel"]).toBe("Cancel");
    expect(res.body.id).toBeUndefined();
  });
});
