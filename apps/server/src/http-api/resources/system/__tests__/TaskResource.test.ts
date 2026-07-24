import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ITaskManager } from "../../../../jobs/TaskManager.js";
import { createScheduledTask, type ScheduledTask } from "../../../../jobs/ScheduledTask.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { taskController, taskToResource } from "../TaskResource.js";

function fakeTaskManager(tasks: ScheduledTask[]): ITaskManager {
  return {
    getPending: () => [],
    getAll: () => tasks,
    getNextExecution: () => new Date(0).toISOString(),
  };
}

function makeApp(tasks: ScheduledTask[]) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/system/task", taskController(fakeTaskManager(tasks)));
  app.use(readarrErrorPipeline());
  return app;
}

describe("taskController", () => {
  it("GET / lists tasks converted to resources, sorted by display name", async () => {
    const tasks: ScheduledTask[] = [
      createScheduledTask({
        id: 1,
        typeName: "NzbDrone.Core.Backup.BackupCommand",
        interval: 1440,
        lastExecution: "2026-01-01T00:00:00.000Z",
      }),
      createScheduledTask({
        id: 2,
        typeName: "NzbDrone.Core.Books.Commands.RefreshAuthorCommand",
        interval: 60,
        lastExecution: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const app = makeApp(tasks);

    const res = await request(app).get("/api/v1/system/task");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // "Backup" sorts before "Refresh Author" alphabetically.
    expect(res.body[0].taskName).toBe("Backup");
    expect(res.body[1].taskName).toBe("RefreshAuthor");
    expect(res.body[1].name).toBe("Refresh Author");
  });

  it("GET /:id returns the matching task", async () => {
    const tasks: ScheduledTask[] = [
      createScheduledTask({
        id: 7,
        typeName: "RssSyncCommand",
        interval: 15,
        lastExecution: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const app = makeApp(tasks);

    const res = await request(app).get("/api/v1/system/task/7");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(7);
    expect(res.body.taskName).toBe("RssSync");
    expect(res.body.name).toBe("Rss Sync");
  });

  it("GET /:id 404s when no task matches", async () => {
    const app = makeApp([]);

    const res = await request(app).get("/api/v1/system/task/999");

    expect(res.status).toBe(404);
  });

  it("computes nextExecution as lastExecution + interval minutes", async () => {
    const tasks: ScheduledTask[] = [
      createScheduledTask({
        id: 1,
        typeName: "RssSyncCommand",
        interval: 15,
        lastExecution: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const app = makeApp(tasks);

    const res = await request(app).get("/api/v1/system/task/1");

    expect(res.body.nextExecution).toBe("2026-01-01T00:15:00.000Z");
  });
});

describe("taskToResource", () => {
  it("strips the trailing 'Command' suffix and takes the last dotted segment as TaskName", () => {
    const task = createScheduledTask({
      id: 1,
      typeName: "NzbDrone.Core.HealthCheck.CheckHealthCommand",
      interval: 360,
      lastExecution: "2026-01-01T00:00:00.000Z",
    });

    const resource = taskToResource(task);

    expect(resource.taskName).toBe("CheckHealth");
    expect(resource.name).toBe("Check Health");
  });
});
