// file: tests/logger.test.ts

/**
 * Phase 18 — Observability: logger unit tests
 *
 * Tests for: lib/logger/index.ts
 *
 * Public API:
 *   logger.info(service, event, data?)   — informational log
 *   logger.warn(service, event, data?)   — warning log
 *   logger.error(service, event, data?)  — error log
 *   logger.metric(service, event, data?) — quantitative measurement
 *
 *   setWriter(fn)   — replace the sink (for testing / alternate backends)
 *   resetWriter()   — restore the default console.log sink
 *
 * Every emitted entry must conform to:
 *   { timestamp, level, service, event, data? }
 *
 * The default writer serialises each entry as a single JSON line to console.log.
 */

import { logger, setWriter, resetWriter, type LogEntry } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Capture helper
// ---------------------------------------------------------------------------

function capture(): { entries: LogEntry[]; restore: () => void } {
  const entries: LogEntry[] = [];
  setWriter((e) => entries.push(e));
  return { entries, restore: resetWriter };
}

afterEach(() => {
  resetWriter();
});

// ===========================================================================
// A. Log levels
// ===========================================================================

describe("logger – log levels", () => {
  it("logger.info emits level 'info'", () => {
    const { entries } = capture();
    logger.info("test-service", "something_happened");
    expect(entries[0].level).toBe("info");
  });

  it("logger.warn emits level 'warn'", () => {
    const { entries } = capture();
    logger.warn("test-service", "something_odd");
    expect(entries[0].level).toBe("warn");
  });

  it("logger.error emits level 'error'", () => {
    const { entries } = capture();
    logger.error("test-service", "something_broke");
    expect(entries[0].level).toBe("error");
  });

  it("logger.metric emits level 'metric'", () => {
    const { entries } = capture();
    logger.metric("test-service", "latency_ms", { durationMs: 42 });
    expect(entries[0].level).toBe("metric");
  });
});

// ===========================================================================
// B. Required fields
// ===========================================================================

describe("logger – required fields", () => {
  it("every entry has a timestamp", () => {
    const { entries } = capture();
    logger.info("svc", "evt");
    expect(entries[0].timestamp).toBeDefined();
  });

  it("timestamp is a valid ISO 8601 string", () => {
    const { entries } = capture();
    logger.info("svc", "evt");
    expect(() => new Date(entries[0].timestamp)).not.toThrow();
    expect(new Date(entries[0].timestamp).toISOString()).toBe(entries[0].timestamp);
  });

  it("every entry has a service field matching the argument", () => {
    const { entries } = capture();
    logger.info("my-service", "evt");
    expect(entries[0].service).toBe("my-service");
  });

  it("every entry has an event field matching the argument", () => {
    const { entries } = capture();
    logger.error("svc", "schedule_generation_failed");
    expect(entries[0].event).toBe("schedule_generation_failed");
  });

  it("data field is present when provided", () => {
    const { entries } = capture();
    logger.error("svc", "evt", { errorCount: 3 });
    expect(entries[0].data).toEqual({ errorCount: 3 });
  });

  it("data field is absent (or undefined) when not provided", () => {
    const { entries } = capture();
    logger.info("svc", "evt");
    expect(entries[0].data).toBeUndefined();
  });

  it("data field preserves nested objects", () => {
    const { entries } = capture();
    logger.error("svc", "evt", { errors: [{ type: "PREREQUISITE_CYCLE" }] });
    expect(entries[0].data?.errors).toEqual([{ type: "PREREQUISITE_CYCLE" }]);
  });
});

// ===========================================================================
// C. Default writer — outputs JSON to console.log
// ===========================================================================

describe("logger – default writer", () => {
  it("writes to console.log as a JSON string by default", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    resetWriter(); // ensure default writer is active
    logger.info("svc", "evt");
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(() => JSON.parse(arg)).not.toThrow();
    const parsed = JSON.parse(arg);
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("evt");
    spy.mockRestore();
  });

  it("each log call produces exactly one JSON line", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    resetWriter();
    logger.warn("svc", "e1");
    logger.error("svc", "e2");
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

// ===========================================================================
// D. Injectable writer
// ===========================================================================

describe("logger – injectable writer", () => {
  it("setWriter replaces the sink", () => {
    const received: LogEntry[] = [];
    setWriter((e) => received.push(e));
    logger.error("svc", "evt");
    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("evt");
  });

  it("resetWriter restores console.log output", () => {
    setWriter(() => { /* swallow */ });
    resetWriter();
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    logger.info("svc", "evt");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("writer receives the full LogEntry object", () => {
    const received: LogEntry[] = [];
    setWriter((e) => received.push(e));
    logger.metric("svc", "api_request", { durationMs: 100, statusCode: 200 });
    expect(received[0]).toMatchObject({
      level:   "metric",
      service: "svc",
      event:   "api_request",
      data:    { durationMs: 100, statusCode: 200 },
    });
  });

  it("multiple logger calls all go to the injected writer", () => {
    const received: LogEntry[] = [];
    setWriter((e) => received.push(e));
    logger.info("s", "e1");
    logger.warn("s", "e2");
    logger.error("s", "e3");
    expect(received).toHaveLength(3);
    expect(received.map((e) => e.event)).toEqual(["e1", "e2", "e3"]);
  });
});
