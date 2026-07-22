import { describe, expect, it, vi } from "vitest";
import { RateLimitService } from "../RateLimitService.js";

describe("RateLimitService", () => {
  it("does not delay the first call for a fresh key", async () => {
    const sleep = vi.fn(async () => {});
    const service = new RateLimitService(sleep);

    await service.waitAndPulse("host.example.com", null, 1000);

    expect(sleep).not.toHaveBeenCalled();
  });

  it("delays a second immediate call for the same key by roughly the interval", async () => {
    const sleep = vi.fn(async () => {});
    const service = new RateLimitService(sleep);

    await service.waitAndPulse("host.example.com", null, 1000);
    await service.waitAndPulse("host.example.com", null, 1000);

    expect(sleep).toHaveBeenCalledTimes(1);
    const delay = sleep.mock.calls[0]![0] as number;
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it("does not delay calls with different keys", async () => {
    const sleep = vi.fn(async () => {});
    const service = new RateLimitService(sleep);

    await service.waitAndPulse("host-a.example.com", null, 1000);
    await service.waitAndPulse("host-b.example.com", null, 1000);

    expect(sleep).not.toHaveBeenCalled();
  });

  it("subKey rate limiting also throttles the shared base key", async () => {
    const sleep = vi.fn(async () => {});
    const service = new RateLimitService(sleep);

    await service.waitAndPulse("indexer.example.com", "search", 1000);
    await service.waitAndPulse("indexer.example.com", "search", 1000);

    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
