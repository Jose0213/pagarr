import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { indexerFlagController } from "../IndexerFlagController.js";

function buildApp() {
  const app = express();
  app.use("/indexerflag", indexerFlagController());
  return app;
}

describe("indexerFlagController", () => {
  it("GET / returns all flags with id always serialized (never stripped)", async () => {
    const res = await request(buildApp()).get("/indexerflag");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "Freeleech", nameLower: "freeleech" },
      { id: 2, name: "Halfleech", nameLower: "halfleech" },
      { id: 4, name: "DoubleUpload", nameLower: "doubleupload" },
      { id: 8, name: "Internal", nameLower: "internal" },
      { id: 16, name: "Scene", nameLower: "scene" },
      { id: 32, name: "Freeleech75", nameLower: "freeleech75" },
      { id: 64, name: "Freeleech25", nameLower: "freeleech25" },
    ]);
  });

  it("every entry carries a lowercased nameLower derived from name", async () => {
    const res = await request(buildApp()).get("/indexerflag");

    for (const flag of res.body as { name: string; nameLower: string }[]) {
      expect(flag.nameLower).toBe(flag.name.toLowerCase());
    }
  });
});
