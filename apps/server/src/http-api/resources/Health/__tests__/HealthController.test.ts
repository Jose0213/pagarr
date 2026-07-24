import { createServer } from "node:http";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { HealthCheckService } from "../../../../health-check/healthCheckService.js";
import { createHealthCheck, HealthCheckResult } from "../../../../health-check/healthCheck.js";
import { CheckHealthCommand } from "../../../../health-check/checkHealthCommand.js";
import { CommandTrigger } from "../../../../messaging/commands/commandTrigger.js";
import type { IProvideHealthCheck } from "../../../../health-check/iProvideHealthCheck.js";
import { EventAggregator } from "../../../../messaging/events/eventAggregator.js";
import { SignalRBroadcaster } from "../../../signalr/SignalRBroadcaster.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { healthController } from "../HealthController.js";

class FailingCheck implements IProvideHealthCheck {
  checkOnStartup = false;
  checkOnSchedule = false;

  check() {
    return Promise.resolve(
      createHealthCheck(FailingCheck, HealthCheckResult.Warning, "Something's off", "#test-frag")
    );
  }
}

function buildApp() {
  const eventAggregator = new EventAggregator();
  const healthCheckService = new HealthCheckService(
    [{ check: new FailingCheck() }],
    { getServerChecks: () => Promise.resolve([]) },
    eventAggregator
  );
  const httpServer = createServer();
  const signalRBroadcaster = new SignalRBroadcaster(httpServer, "/signalr-test-health");

  const router = healthController({ healthCheckService, eventAggregator, signalRBroadcaster });

  const app = express();
  app.use(express.json());
  app.use("/health", router);
  app.use(readarrErrorPipeline());

  return { app, healthCheckService };
}

describe("healthController", () => {
  it("GET /health returns the current health-check results with camelCase enum wire names", async () => {
    const { app, healthCheckService } = buildApp();
    const command = new CheckHealthCommand();
    command.trigger = CommandTrigger.Manual;
    await healthCheckService.execute(command);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      source: "FailingCheck",
      type: "warning",
      message: "Something's off",
    });
    expect(res.body[0].wikiUrl).toContain("wiki.servarr.com");
  });

  it("GET /health/:id is not implemented, matching the real controller's NotImplementedException", async () => {
    const { app } = buildApp();

    const res = await request(app).get("/health/1");

    expect(res.status).toBe(500);
  });
});
