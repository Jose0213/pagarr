import { DatabaseSync } from "node:sqlite";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ModelConflictException, ModelNotFoundException } from "../../../db/errors.js";
import { NzbDroneClientException } from "../../../exceptions/NzbDroneClientException.js";
import { ValidationException } from "../../../validation/validationResult.js";
import { BadRequestException } from "../../rest/BadRequestException.js";
import { NotFoundException } from "../../rest/NotFoundException.js";
import { readarrErrorPipeline } from "../ReadarrErrorPipeline.js";

function buildApp(thrower: () => void) {
  const app = express();
  app.get("/boom", () => {
    thrower();
  });
  app.use(readarrErrorPipeline());
  return app;
}

describe("readarrErrorPipeline", () => {
  it("maps ApiException subclasses to their own statusCode with an ErrorModel body", async () => {
    const app = buildApp(() => {
      throw new BadRequestException("bad stuff");
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "400: bad stuff", content: "bad stuff" });
  });

  it("maps NotFoundException to 404", async () => {
    const app = buildApp(() => {
      throw new NotFoundException();
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(404);
  });

  it("maps ValidationException to 400 with the RAW errors array (not wrapped in ErrorModel)", async () => {
    const app = buildApp(() => {
      throw new ValidationException([{ propertyName: "name", errorMessage: "required" }]);
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body).toEqual([{ propertyName: "name", errorMessage: "required" }]);
  });

  it("maps NzbDroneClientException to its own statusCode", async () => {
    const app = buildApp(() => {
      throw new NzbDroneClientException(422, "unprocessable");
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(422);
  });

  it("maps ModelNotFoundException to 404", async () => {
    const app = buildApp(() => {
      throw new ModelNotFoundException("Widget", 5);
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(404);
  });

  it("maps ModelConflictException to 409", async () => {
    const app = buildApp(() => {
      throw new ModelConflictException("conflict");
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(409);
  });

  it("maps an unhandled error to 500", async () => {
    const app = buildApp(() => {
      throw new Error("something broke");
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("something broke");
  });

  describe("SQLite constraint-conflict detection (real node:sqlite errors, not a message-string guess)", () => {
    function realSqliteConstraintError(): unknown {
      const db = new DatabaseSync(":memory:");
      db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT UNIQUE)");
      db.prepare("INSERT INTO t (name) VALUES (?)").run("a");
      try {
        db.prepare("INSERT INTO t (name) VALUES (?)").run("a");
        throw new Error("expected a constraint violation");
      } catch (e) {
        return e;
      } finally {
        db.close();
      }
    }

    function realSqliteNonConstraintError(): unknown {
      const db = new DatabaseSync(":memory:");
      try {
        db.prepare("SELECT * FROM nonexistent_table").run();
        throw new Error("expected a sqlite error");
      } catch (e) {
        return e;
      } finally {
        db.close();
      }
    }

    it("maps a real UNIQUE constraint violation to 409 on POST/PUT", async () => {
      const err = realSqliteConstraintError();
      const app = express();
      app.post("/boom", () => {
        throw err;
      });
      app.use(readarrErrorPipeline());

      const res = await request(app).post("/boom");

      expect(res.status).toBe(409);
    });

    it("does NOT map a constraint violation to 409 on GET (matches the real PUT/POST-only gate)", async () => {
      const err = realSqliteConstraintError();
      const app = express();
      app.get("/boom", () => {
        throw err;
      });
      app.use(readarrErrorPipeline());

      const res = await request(app).get("/boom");

      expect(res.status).toBe(500);
    });

    it("does not map a non-constraint SQLite error to 409, even on POST", async () => {
      const err = realSqliteNonConstraintError();
      const app = express();
      app.post("/boom", () => {
        throw err;
      });
      app.use(readarrErrorPipeline());

      const res = await request(app).post("/boom");

      expect(res.status).toBe(500);
    });
  });
});
