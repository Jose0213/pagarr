import { describe, expect, it, vi } from "vitest";
import { EventAggregator } from "../../messaging/index.js";
import { LifecycleService, SERVICE_NAME, type ServiceControllerLike } from "../lifecycleService.js";
import { ApplicationShutdownRequested } from "../applicationShutdownRequested.js";
import type { IHandle } from "../../messaging/index.js";

/**
 * No C# test fixture exists for LifecycleService in
 * NzbDrone.Core.Test/Lifecycle (there is no LifecycleServiceFixture.cs in
 * the real source tree -- verified by searching NzbDrone.Core.Test/ and
 * NzbDrone.Common.Test/ for "Lifecycle"). These tests are new, written
 * directly against LifecycleService.cs's documented behavior: Shutdown()/
 * Restart() publish ApplicationShutdownRequested(restarting) then
 * conditionally stop/restart the Windows service.
 */

function fakeServiceController(): ServiceControllerLike & {
  stop: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
} {
  return {
    stop: vi.fn(),
    restart: vi.fn(),
  };
}

describe("LifecycleService", () => {
  it("shutdown publishes ApplicationShutdownRequested with restarting=false", () => {
    const aggregator = new EventAggregator();
    const handler: IHandle<ApplicationShutdownRequested> = { handle: vi.fn() };
    aggregator.subscribe(ApplicationShutdownRequested, handler);

    const service = new LifecycleService(
      aggregator,
      { isWindowsService: false },
      fakeServiceController()
    );
    service.shutdown();

    expect(handler.handle).toHaveBeenCalledTimes(1);
    const published = (handler.handle as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as ApplicationShutdownRequested;
    expect(published.restarting).toBe(false);
  });

  it("restart publishes ApplicationShutdownRequested with restarting=true", () => {
    const aggregator = new EventAggregator();
    const handler: IHandle<ApplicationShutdownRequested> = { handle: vi.fn() };
    aggregator.subscribe(ApplicationShutdownRequested, handler);

    const service = new LifecycleService(
      aggregator,
      { isWindowsService: false },
      fakeServiceController()
    );
    service.restart();

    expect(handler.handle).toHaveBeenCalledTimes(1);
    const published = (handler.handle as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as ApplicationShutdownRequested;
    expect(published.restarting).toBe(true);
  });

  it("does not touch the service controller when not running as a Windows service", () => {
    const aggregator = new EventAggregator();
    const serviceController = fakeServiceController();

    const service = new LifecycleService(
      aggregator,
      { isWindowsService: false },
      serviceController
    );
    service.shutdown();
    service.restart();

    expect(serviceController.stop).not.toHaveBeenCalled();
    expect(serviceController.restart).not.toHaveBeenCalled();
  });

  it("stops the Windows service on shutdown when running as a Windows service", () => {
    const aggregator = new EventAggregator();
    const serviceController = fakeServiceController();

    const service = new LifecycleService(aggregator, { isWindowsService: true }, serviceController);
    service.shutdown();

    expect(serviceController.stop).toHaveBeenCalledWith(SERVICE_NAME);
    expect(serviceController.restart).not.toHaveBeenCalled();
  });

  it("restarts the Windows service on restart when running as a Windows service", () => {
    const aggregator = new EventAggregator();
    const serviceController = fakeServiceController();

    const service = new LifecycleService(aggregator, { isWindowsService: true }, serviceController);
    service.restart();

    expect(serviceController.restart).toHaveBeenCalledWith(SERVICE_NAME);
    expect(serviceController.stop).not.toHaveBeenCalled();
  });

  it("executeShutdown delegates to shutdown()", () => {
    const aggregator = new EventAggregator();
    const handler: IHandle<ApplicationShutdownRequested> = { handle: vi.fn() };
    aggregator.subscribe(ApplicationShutdownRequested, handler);
    const serviceController = fakeServiceController();

    const service = new LifecycleService(aggregator, { isWindowsService: true }, serviceController);
    void service.executeShutdown.execute({ name: "Shutdown" } as never);

    expect(serviceController.stop).toHaveBeenCalledWith(SERVICE_NAME);
    const published = (handler.handle as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as ApplicationShutdownRequested;
    expect(published.restarting).toBe(false);
  });

  it("executeRestart delegates to restart()", () => {
    const aggregator = new EventAggregator();
    const handler: IHandle<ApplicationShutdownRequested> = { handle: vi.fn() };
    aggregator.subscribe(ApplicationShutdownRequested, handler);
    const serviceController = fakeServiceController();

    const service = new LifecycleService(aggregator, { isWindowsService: true }, serviceController);
    void service.executeRestart.execute({ name: "Restart" } as never);

    expect(serviceController.restart).toHaveBeenCalledWith(SERVICE_NAME);
    const published = (handler.handle as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as ApplicationShutdownRequested;
    expect(published.restarting).toBe(true);
  });

  it("calls onInfo with the same messages as the C# logger calls", () => {
    const aggregator = new EventAggregator();
    const onInfo = vi.fn();
    const service = new LifecycleService(
      aggregator,
      { isWindowsService: false },
      fakeServiceController(),
      onInfo
    );

    service.shutdown();
    expect(onInfo).toHaveBeenCalledWith("Shutdown requested.");

    service.restart();
    expect(onInfo).toHaveBeenCalledWith("Restart requested.");
  });
});
