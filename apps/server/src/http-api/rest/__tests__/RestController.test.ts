import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ValidationException } from "../../../validation/validationResult.js";
import { restController, validateId, validateResource } from "../RestController.js";
import type { RestResource } from "../RestResource.js";
import { readarrErrorPipeline } from "../../error-management/ReadarrErrorPipeline.js";

interface Widget extends RestResource {
  id: number;
  name: string;
}

function buildApp(router: ReturnType<typeof restController<Widget>>) {
  const app = express();
  app.use(express.json());
  app.use("/widget", router);
  app.use(readarrErrorPipeline());
  return app;
}

describe("restController", () => {
  it("mounts GET / and strips id:0 from each result", async () => {
    const router = restController<Widget>({
      getAll: () => [
        { id: 0, name: "template" },
        { id: 1, name: "real" },
      ],
    });
    const app = buildApp(router);

    const res = await request(app).get("/widget");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ name: "template" }, { id: 1, name: "real" }]);
  });

  it("mounts GET /:id", async () => {
    const router = restController<Widget>({
      getById: (id) => ({ id, name: `widget-${id}` }),
    });
    const app = buildApp(router);

    const res = await request(app).get("/widget/5");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 5, name: "widget-5" });
  });

  it("does not mount unsupplied handlers", async () => {
    const router = restController<Widget>({});
    const app = buildApp(router);

    const res = await request(app).get("/widget");

    expect(res.status).toBe(404);
  });

  describe("POST / (create)", () => {
    it("creates and returns 201", async () => {
      const created: Widget[] = [];
      const router = restController<Widget>({
        create: (resource) => {
          created.push(resource);
          return { ...resource, id: 42 };
        },
      });
      const app = buildApp(router);

      const res = await request(app).post("/widget").send({ id: 0, name: "new" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 42, name: "new" });
      expect(created).toHaveLength(1);
    });

    it("runs sharedValidator and postValidator on POST, throwing ValidationException on failure", async () => {
      const router = restController<Widget>({
        create: (resource) => resource,
        sharedValidator: (r) =>
          r.name ? [] : [{ propertyName: "name", errorMessage: "required" }],
        postValidator: () => [{ propertyName: "extra", errorMessage: "post-only failure" }],
      });
      const app = buildApp(router);

      const res = await request(app).post("/widget").send({ id: 0, name: "" });

      expect(res.status).toBe(400);
      // Ported: raw ValidationException.errors array, not wrapped in ErrorModel.
      expect(res.body).toEqual([
        { propertyName: "name", errorMessage: "required" },
        { propertyName: "extra", errorMessage: "post-only failure" },
      ]);
    });

    it("skips postValidator (but not sharedValidator) when the request path ends in /test", async () => {
      const router = restController<Widget>({
        create: (resource) => resource,
        sharedValidator: () => [{ propertyName: "shared", errorMessage: "shared failure" }],
        postValidator: () => [{ propertyName: "post", errorMessage: "post failure" }],
      });
      const app = express();
      app.use(express.json());
      app.use("/widget/test", router); // full request path ends in "/test"
      app.use(readarrErrorPipeline());

      const res = await request(app).post("/widget/test").send({ id: 0, name: "x" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual([{ propertyName: "shared", errorMessage: "shared failure" }]);
    });

    it("rejects an empty body with BadRequestException", async () => {
      const router = restController<Widget>({ create: (resource) => resource });
      const app = express();
      app.use(express.json());
      app.use(
        "/widget",
        (req, _res, next) => {
          // Simulate a request with no parsed body at all (undefined), the
          // way an empty POST body arrives.
          req.body = undefined;
          next();
        },
        router
      );
      app.use(readarrErrorPipeline());

      const res = await request(app).post("/widget").set("Content-Type", "application/json");

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Request body can't be empty");
    });
  });

  describe("PUT /:id (update)", () => {
    it("maps the route id onto the body when the body's id is unset", async () => {
      let received: Widget | undefined;
      const router = restController<Widget>({
        update: (resource) => {
          received = resource;
          return resource;
        },
      });
      const app = buildApp(router);

      const res = await request(app).put("/widget/7").send({ id: 0, name: "updated" });

      expect(res.status).toBe(202);
      expect(received).toEqual({ id: 7, name: "updated" });
    });

    it("does not overwrite an already-set body id with the route id", async () => {
      let received: Widget | undefined;
      const router = restController<Widget>({
        update: (resource) => {
          received = resource;
          return resource;
        },
      });
      const app = buildApp(router);

      await request(app).put("/widget/7").send({ id: 99, name: "updated" });

      expect(received?.id).toBe(99);
    });

    it("validates the route id (BadRequestException if <= 0)", async () => {
      const router = restController<Widget>({ update: (resource) => resource });
      const app = buildApp(router);

      const res = await request(app).put("/widget/0").send({ id: 0, name: "x" });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("is not a valid ID");
    });

    it("runs putValidator regardless of skipValidation (asymmetric with POST)", async () => {
      const router = restController<Widget>({
        update: (resource) => resource,
        putValidator: () => [{ propertyName: "name", errorMessage: "put failure" }],
      });
      const app = buildApp(router);

      const res = await request(app).put("/widget/1").send({ id: 1, name: "x" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual([{ propertyName: "name", errorMessage: "put failure" }]);
    });
  });

  describe("DELETE /:id", () => {
    it("validates the id and calls the delete handler", async () => {
      const deleted: number[] = [];
      const router = restController<Widget>({
        delete: (id) => {
          deleted.push(id);
        },
      });
      const app = buildApp(router);

      const res = await request(app).delete("/widget/3");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(deleted).toEqual([3]);
    });

    it("rejects id <= 0", async () => {
      const router = restController<Widget>({ delete: () => {} });
      const app = buildApp(router);

      const res = await request(app).delete("/widget/-1");

      expect(res.status).toBe(400);
    });
  });
});

describe("validateId", () => {
  it("throws for zero or negative ids", () => {
    expect(() => validateId(0)).toThrow("is not a valid ID");
    expect(() => validateId(-5)).toThrow("is not a valid ID");
  });

  it("does not throw for positive integers", () => {
    expect(() => validateId(1)).not.toThrow();
  });
});

describe("validateResource", () => {
  const validators = {
    sharedValidator: () => [],
    postValidator: () => [{ propertyName: "x", errorMessage: "post" }],
    putValidator: () => [{ propertyName: "y", errorMessage: "put" }],
  };

  it("throws BadRequestException for a null/undefined resource", () => {
    expect(() => validateResource(undefined, "POST", "/widget", validators)).toThrow(
      "Request body can't be empty"
    );
  });

  it("respects skipValidation/skipValidationShared options", () => {
    const combining = {
      sharedValidator: () => [{ propertyName: "s", errorMessage: "shared" }],
      postValidator: () => [{ propertyName: "p", errorMessage: "post" }],
      putValidator: () => [],
    };

    expect(() =>
      validateResource({ id: 1, name: "x" }, "POST", "/widget", combining, {
        skipValidation: true,
        skipValidationShared: true,
      })
    ).not.toThrow();

    try {
      validateResource({ id: 1, name: "x" }, "POST", "/widget", combining, {
        skipValidation: true,
        skipValidationShared: false,
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationException);
      expect((e as ValidationException).errors).toEqual([
        { propertyName: "s", errorMessage: "shared" },
      ]);
    }
  });
});
