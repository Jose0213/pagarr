import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDatabase, DEFAULT_LOG_MIGRATIONS_DIR } from "../../../../db/db-factory.js";
import { LogRepository } from "../../../../instrumentation/logRepository.js";
import { LogService } from "../../../../instrumentation/logService.js";
import { logController } from "../LogController.js";

function buildApp() {
  const db = createDatabase("TestLog", {
    path: ":memory:",
    migrationsDir: DEFAULT_LOG_MIGRATIONS_DIR,
  });
  const logService = new LogService(new LogRepository(db));

  const router = logController({ logService });
  const app = express();
  app.use("/log", router);

  return { app, db };
}

function insertLog(db: ReturnType<typeof createDatabase>, level: string, message: string) {
  db.openConnection()
    .prepare(
      'INSERT INTO "Logs" ("Message", "Time", "Logger", "Exception", "ExceptionType", "Level") VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(message, new Date().toISOString(), "TestLogger", null, null, level);
}

describe("logController", () => {
  it("GET /log returns a paged response with lower-cased levels and sortKey remapped to time", async () => {
    const { app, db } = buildApp();
    insertLog(db, "Info", "hello");

    const res = await request(app).get("/log");

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].level).toBe("info");
    expect(res.body.sortKey).toBe("time");
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.totalRecords).toBe(1);
  });

  it("level=warn matches Fatal/Error/Warn cumulatively, not just Warn", async () => {
    const { app, db } = buildApp();
    insertLog(db, "Fatal", "f");
    insertLog(db, "Error", "e");
    insertLog(db, "Warn", "w");
    insertLog(db, "Info", "i");

    const res = await request(app).get("/log").query({ level: "warn" });

    const records = res.body.records as { level: string }[];
    expect(records.map((r) => r.level).sort()).toEqual(["error", "fatal", "warn"]);
  });

  it("level=fatal matches only Fatal", async () => {
    const { app, db } = buildApp();
    insertLog(db, "Fatal", "f");
    insertLog(db, "Error", "e");

    const res = await request(app).get("/log").query({ level: "fatal" });

    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].level).toBe("fatal");
  });

  it("an unrecognized level applies no filter", async () => {
    const { app, db } = buildApp();
    insertLog(db, "Info", "i");

    const res = await request(app).get("/log").query({ level: "bogus" });

    expect(res.body.records).toHaveLength(1);
  });

  it("respects page/pageSize query params", async () => {
    const { app, db } = buildApp();
    for (let i = 0; i < 15; i++) {
      insertLog(db, "Info", `message-${i}`);
    }

    const res = await request(app).get("/log").query({ page: "2", pageSize: "10" });

    expect(res.body.records).toHaveLength(5);
    expect(res.body.page).toBe(2);
  });
});
