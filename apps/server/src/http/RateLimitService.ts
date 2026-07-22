// Ported from NzbDrone.Common/TPL/RateLimitService.cs
//
// C# stores wait-until timestamps in an in-process ConcurrentDictionary
// backed by ICacheManager; we use a plain Map since Node is single-threaded
// (no concurrent-dictionary race to guard against) and this module doesn't
// own a cache manager of its own (that's Phase 0's Configuration/Datastore
// module, ported separately).

export interface IRateLimitService {
  waitAndPulse(key: string, intervalMs: number): Promise<void>;
  waitAndPulse(key: string, subKey: string | null, intervalMs: number): Promise<void>;
}

export class RateLimitService implements IRateLimitService {
  private readonly rateLimitStore = new Map<string, number>();

  /** Overridable sleep primitive so tests can fake timers without real delay. */
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(sleep: (ms: number) => Promise<void> = defaultSleep) {
    this.sleep = sleep;
  }

  async waitAndPulse(key: string, subKeyOrInterval: string | null | number, intervalMs?: number): Promise<void> {
    let subKey: string | null;
    let interval: number;

    if (typeof subKeyOrInterval === "number") {
      subKey = null;
      interval = subKeyOrInterval;
    } else {
      subKey = subKeyOrInterval;
      interval = intervalMs!;
    }

    const delay = this.getDelay(key, subKey, interval);

    if (delay > 0) {
      await this.sleep(delay);
    }
  }

  private getDelay(key: string, subKey: string | null, interval: number): number {
    let waitUntil = Date.now() + interval;

    if (subKey !== null && subKey !== "") {
      // Expand the base key timer, but don't extend it beyond now+interval.
      const baseUntil = this.addOrUpdate(key, waitUntil, (existing) => Math.max(waitUntil, existing));

      if (baseUntil > waitUntil) {
        waitUntil = baseUntil;
      }

      // Wait for the full key.
      const combinedKey = `${key}-${subKey}`;
      waitUntil = this.addOrUpdate(combinedKey, waitUntil, (existing) =>
        Math.max(waitUntil, existing + interval)
      );
    } else {
      waitUntil = this.addOrUpdate(key, waitUntil, (existing) => Math.max(waitUntil, existing + interval));
    }

    waitUntil -= interval;

    return waitUntil - Date.now();
  }

  private addOrUpdate(key: string, initial: number, update: (existing: number) => number): number {
    const existing = this.rateLimitStore.get(key);
    const next = existing === undefined ? initial : update(existing);
    this.rateLimitStore.set(key, next);
    return next;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
