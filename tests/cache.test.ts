// file: tests/cache.test.ts

import { InMemoryCache } from "@/lib/cache/memory";
import { CacheKeys, VALIDATOR_TTL_SECONDS } from "@/lib/cache/keys";
import {
  getOrComputeValidationResult,
  invalidateValidationResult,
} from "@/lib/cache/validator-cache";
import type { Cache } from "@/lib/cache/cache";
import type { ValidationResult } from "@/lib/validator/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidationResult(valid: boolean): ValidationResult {
  return {
    valid,
    errors: valid
      ? []
      : [{ type: "MISSING_COLL", message: "Missing COLL 100 requirement" }],
  };
}

// ---------------------------------------------------------------------------
// InMemoryCache — low-level behaviour
// ---------------------------------------------------------------------------

describe("InMemoryCache", () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new InMemoryCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── get / set ─────────────────────────────────────────────────────────────

  it("returns null for a key that has never been set", async () => {
    expect(await cache.get("missing")).toBeNull();
  });

  it("returns the stored value on a cache hit", async () => {
    await cache.set("key1", { data: 42 }, 60);
    expect(await cache.get("key1")).toEqual({ data: 42 });
  });

  it("preserves the exact value type (string, number, object)", async () => {
    await cache.set("str", "hello", 60);
    await cache.set("num", 99, 60);
    await cache.set("obj", { a: 1, b: [2, 3] }, 60);

    expect(await cache.get("str")).toBe("hello");
    expect(await cache.get("num")).toBe(99);
    expect(await cache.get("obj")).toEqual({ a: 1, b: [2, 3] });
  });

  it("overwrites an existing entry when set is called again with the same key", async () => {
    await cache.set("key1", "first", 60);
    await cache.set("key1", "second", 60);
    expect(await cache.get("key1")).toBe("second");
  });

  it("stores multiple keys independently", async () => {
    await cache.set("a", 1, 60);
    await cache.set("b", 2, 60);
    expect(await cache.get("a")).toBe(1);
    expect(await cache.get("b")).toBe(2);
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("returns null after a key is deleted", async () => {
    await cache.set("key1", "value", 60);
    await cache.delete("key1");
    expect(await cache.get("key1")).toBeNull();
  });

  it("deleting a non-existent key does not throw", async () => {
    await expect(cache.delete("ghost")).resolves.toBeUndefined();
  });

  it("deleting one key does not affect other keys", async () => {
    await cache.set("a", 1, 60);
    await cache.set("b", 2, 60);
    await cache.delete("a");
    expect(await cache.get("b")).toBe(2);
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  it("clear removes all stored entries", async () => {
    await cache.set("a", 1, 60);
    await cache.set("b", 2, 60);
    await cache.clear();
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).toBeNull();
  });

  // ── TTL expiration ────────────────────────────────────────────────────────

  it("returns the value before TTL expires", async () => {
    await cache.set("key1", "alive", 60); // 60-second TTL
    jest.advanceTimersByTime(59_000);     // advance 59 s
    expect(await cache.get("key1")).toBe("alive");
  });

  it("returns null after TTL expires", async () => {
    await cache.set("key1", "alive", 60);
    jest.advanceTimersByTime(61_000);     // advance 61 s — past TTL
    expect(await cache.get("key1")).toBeNull();
  });

  it("returns null at the exact TTL boundary", async () => {
    await cache.set("key1", "alive", 60);
    jest.advanceTimersByTime(60_000);     // exactly 60 s — expired
    expect(await cache.get("key1")).toBeNull();
  });

  it("each key respects its own TTL independently", async () => {
    await cache.set("short", "s", 10);
    await cache.set("long", "l", 120);

    jest.advanceTimersByTime(11_000); // short expired, long still alive

    expect(await cache.get("short")).toBeNull();
    expect(await cache.get("long")).toBe("l");
  });

  it("overwriting a key resets its TTL", async () => {
    await cache.set("key1", "v1", 60);
    jest.advanceTimersByTime(50_000);        // 50 s elapsed
    await cache.set("key1", "v2", 60);      // reset TTL to 60 s from now
    jest.advanceTimersByTime(30_000);        // total 80 s from first set, 30 s from second
    expect(await cache.get("key1")).toBe("v2"); // should still be alive (30 < 60)
  });
});

// ---------------------------------------------------------------------------
// CacheKeys — key format contract
// ---------------------------------------------------------------------------

describe("CacheKeys", () => {
  it("validatorResult produces a namespaced string key", () => {
    expect(CacheKeys.validatorResult("sched-abc")).toBe("validator:sched-abc");
  });

  it("different scheduleIds produce different keys", () => {
    expect(CacheKeys.validatorResult("sched-1")).not.toBe(
      CacheKeys.validatorResult("sched-2")
    );
  });

  it("VALIDATOR_TTL_SECONDS is 300 (5 minutes)", () => {
    expect(VALIDATOR_TTL_SECONDS).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// getOrComputeValidationResult
// ---------------------------------------------------------------------------

describe("getOrComputeValidationResult", () => {
  let cache: Cache;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new InMemoryCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calls compute and returns the result on a cache miss", async () => {
    const compute = jest.fn().mockResolvedValue(makeValidationResult(true));

    const result = await getOrComputeValidationResult(cache, "sched-1", compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(result.valid).toBe(true);
  });

  it("stores the computed result so subsequent calls are cache hits", async () => {
    const compute = jest.fn().mockResolvedValue(makeValidationResult(true));

    await getOrComputeValidationResult(cache, "sched-1", compute);
    await getOrComputeValidationResult(cache, "sched-1", compute);

    expect(compute).toHaveBeenCalledTimes(1); // second call hit cache
  });

  it("returns the cached result on a hit without calling compute", async () => {
    const first = makeValidationResult(true);
    const compute = jest.fn().mockResolvedValue(first);

    await getOrComputeValidationResult(cache, "sched-1", compute);

    // Replace compute with a different result — should not be called
    const secondCompute = jest.fn().mockResolvedValue(makeValidationResult(false));
    const result = await getOrComputeValidationResult(cache, "sched-1", secondCompute);

    expect(secondCompute).not.toHaveBeenCalled();
    expect(result.valid).toBe(true); // still the first result
  });

  it("caches different scheduleIds independently", async () => {
    const computeA = jest.fn().mockResolvedValue(makeValidationResult(true));
    const computeB = jest.fn().mockResolvedValue(makeValidationResult(false));

    const resultA = await getOrComputeValidationResult(cache, "sched-A", computeA);
    const resultB = await getOrComputeValidationResult(cache, "sched-B", computeB);

    expect(resultA.valid).toBe(true);
    expect(resultB.valid).toBe(false);
    expect(computeA).toHaveBeenCalledTimes(1);
    expect(computeB).toHaveBeenCalledTimes(1);
  });

  it("recomputes after the TTL expires", async () => {
    const compute = jest.fn().mockResolvedValue(makeValidationResult(true));

    await getOrComputeValidationResult(cache, "sched-1", compute);

    jest.advanceTimersByTime(VALIDATOR_TTL_SECONDS * 1000 + 1); // past TTL

    await getOrComputeValidationResult(cache, "sched-1", compute);

    expect(compute).toHaveBeenCalledTimes(2); // recomputed after expiry
  });

  it("does not recompute before the TTL expires", async () => {
    const compute = jest.fn().mockResolvedValue(makeValidationResult(true));

    await getOrComputeValidationResult(cache, "sched-1", compute);

    jest.advanceTimersByTime(VALIDATOR_TTL_SECONDS * 1000 - 1000); // 1 s before expiry

    await getOrComputeValidationResult(cache, "sched-1", compute);

    expect(compute).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// invalidateValidationResult
// ---------------------------------------------------------------------------

describe("invalidateValidationResult", () => {
  let cache: Cache;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new InMemoryCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("causes the next getOrComputeValidationResult call to recompute", async () => {
    const compute = jest.fn().mockResolvedValue(makeValidationResult(true));

    await getOrComputeValidationResult(cache, "sched-1", compute);
    await invalidateValidationResult(cache, "sched-1");
    await getOrComputeValidationResult(cache, "sched-1", compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("only invalidates the target schedule — other schedules remain cached", async () => {
    const computeA = jest.fn().mockResolvedValue(makeValidationResult(true));
    const computeB = jest.fn().mockResolvedValue(makeValidationResult(false));

    await getOrComputeValidationResult(cache, "sched-A", computeA);
    await getOrComputeValidationResult(cache, "sched-B", computeB);

    await invalidateValidationResult(cache, "sched-A");

    // sched-A recomputes, sched-B still cached
    await getOrComputeValidationResult(cache, "sched-A", computeA);
    await getOrComputeValidationResult(cache, "sched-B", computeB);

    expect(computeA).toHaveBeenCalledTimes(2);
    expect(computeB).toHaveBeenCalledTimes(1);
  });

  it("invalidating a schedule that was never cached does not throw", async () => {
    await expect(
      invalidateValidationResult(cache, "sched-ghost")
    ).resolves.toBeUndefined();
  });

  it("stores fresh result after invalidation and recompute", async () => {
    const staleResult = makeValidationResult(true);
    const freshResult = makeValidationResult(false);

    await getOrComputeValidationResult(cache, "sched-1", jest.fn().mockResolvedValue(staleResult));
    await invalidateValidationResult(cache, "sched-1");
    const result = await getOrComputeValidationResult(
      cache,
      "sched-1",
      jest.fn().mockResolvedValue(freshResult)
    );

    expect(result.valid).toBe(false); // fresh result, not stale
  });
});
