import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { languageController } from "../LanguageController.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/language", languageController());
  app.use(readarrErrorPipeline());
  return app;
}

describe("languageController", () => {
  describe("GET /", () => {
    it("returns every known language ordered by name, including id 0 (Unknown)", async () => {
      const app = buildApp();

      const res = await request(app).get("/api/v1/language");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      // Ordered by Name (ordinal), matches the C# `.OrderBy(l => l.Name)`.
      const names = (res.body as { name: string }[]).map((l) => l.name);
      const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      expect(names).toEqual(sorted);

      // "Unknown" (id 0) must be present with its id NOT stripped -- unlike
      // every other RestResource, LanguageResource.Id is
      // [JsonIgnore(Condition = Never)].
      const unknown = (res.body as { id: number; name: string; nameLower: string }[]).find(
        (l) => l.name === "Unknown"
      );
      expect(unknown).toEqual({ id: 0, name: "Unknown", nameLower: "unknown" });
    });

    it("includes the negative-id sentinel languages (Any=-1, Original=-2)", async () => {
      const app = buildApp();

      const res = await request(app).get("/api/v1/language");

      const ids = (res.body as { id: number }[]).map((l) => l.id);
      expect(ids).toContain(-1);
      expect(ids).toContain(-2);
    });
  });

  describe("GET /:id", () => {
    it("returns the language for a known id, id included even when 0", async () => {
      const app = buildApp();

      const res = await request(app).get("/api/v1/language/0");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 0, name: "Unknown", nameLower: "unknown" });
    });

    it("returns English for id 1", async () => {
      const app = buildApp();

      const res = await request(app).get("/api/v1/language/1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 1, name: "English", nameLower: "english" });
    });

    it("resolves negative sentinel ids (Any/-1, Original/-2)", async () => {
      const app = buildApp();

      const any = await request(app).get("/api/v1/language/-1");
      expect(any.status).toBe(200);
      expect(any.body).toEqual({ id: -1, name: "Any", nameLower: "any" });

      const original = await request(app).get("/api/v1/language/-2");
      expect(original.status).toBe(200);
      expect(original.body).toEqual({ id: -2, name: "Original", nameLower: "original" });
    });

    it("500s (not 404s) for an id matching no known language -- matches the real C# ArgumentException falling through to the generic handler", async () => {
      const app = buildApp();

      const res = await request(app).get("/api/v1/language/9999");

      expect(res.status).toBe(500);
    });
  });
});
