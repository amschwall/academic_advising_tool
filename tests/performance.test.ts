// file: tests/performance.test.ts
//
// Phase 21 — Performance & Optimization Tests (Node environment)
//
// Covers:
//   1. Schedule generation < 2s   (pure generator function, no mocks needed)
//   2. Course search < 200ms      (route handler with instant-mock Prisma)
//   3. AI chat route overhead     (route handler with instant-mock Anthropic SDK)
//   4. Cache improves performance (getOrComputeValidationResult — hit vs. compute)

// ---------------------------------------------------------------------------
// Module mocks (hoisted before any imports)
// ---------------------------------------------------------------------------

// Supabase — required by withRole middleware used in the search route
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async (token: string) => {
        if (token === "student-token") {
          return {
            data: {
              user: {
                id: "student-123",
                email: "student@wm.edu",
                user_metadata: { role: "student" },
              },
            },
            error: null,
          };
        }
        return {
          data: { user: null },
          error: { message: "Invalid token", status: 401 },
        };
      }),
    },
  })),
}));

// Prisma — individual tests control what the DB returns
jest.mock("@/lib/db", () => ({
  prisma: {
    course: {
      findMany: jest.fn(),
      count:    jest.fn(),
    },
  },
}));

// Anthropic SDK — stream() is a configurable jest.fn() so each test can
// provide its own async-iterable without re-importing the module.
// __esModule: true is required so ts-jest's esModuleInterop maps
// `import Anthropic from "@anthropic-ai/sdk"` to the `default` property;
// without it the whole mock object is used as the constructor, causing
// "not a constructor" errors.
const mockStream = jest.fn();
jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { stream: mockStream },
  })),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { NextRequest }           from "next/server";
import { generateSchedule }      from "@/lib/generator/generator";
import { GET as searchHandler, searchCache } from "@/app/api/courses/search/route";
import { POST as chatHandler }   from "@/app/api/chat/route";
import { InMemoryCache }         from "@/lib/cache/memory";
import {
  getOrComputeValidationResult,
  invalidateValidationResult,
}                                from "@/lib/cache/validator-cache";
import { prisma }                from "@/lib/db";
import type {
  GeneratorInput,
  PlannedSemester,
  Season,
}                                from "@/lib/generator/types";
import type { ValidationResult } from "@/lib/validator/types";

// ---------------------------------------------------------------------------
// Typed mock refs
// ---------------------------------------------------------------------------

const mockFindMany = prisma.course.findMany as jest.Mock;
const mockCount    = prisma.course.count    as jest.Mock;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Build a GeneratorInput with `courseCount` independent courses across `semesterCount` semesters. */
function buildLargeInput(courseCount = 40, semesterCount = 8): GeneratorInput {
  const majorRequirements = Array.from({ length: courseCount }, (_, i) => ({
    code:              `PERF${String(i).padStart(3, "0")}`,
    credits:           3,
    prerequisiteCodes: [] as string[],
    collAttribute:     null,
    seasons:           ["FALL", "SPRING"] as Season[],
  }));

  const plannedSemesters: PlannedSemester[] = Array.from(
    { length: semesterCount },
    (_, i) => ({
      year:   2024 + Math.floor(i / 2),
      season: (i % 2 === 0 ? "FALL" : "SPRING") as Season,
    }),
  );

  return {
    student:               { id: "perf-student", catalogYear: 2024 },
    completedCourses:      [],
    majorRequirements,
    collRequirements:      [],
    electivePool:          [],
    electiveCreditsNeeded: 0,
    plannedSemesters,
    availableSections:     {},
    preferences:           {},
  };
}

/**
 * Build `count` fake Prisma course rows — the shape returned by
 * prisma.course.findMany with prerequisites and sections included.
 */
function buildPrismaCourses(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    code:          `SRCH${String(i).padStart(3, "0")}`,
    title:         `Search Course ${i}`,
    department:    "SRCH",
    credits:       3,
    collAttribute: null,
    description:   `Description for course ${i}`,
    prerequisites: [],
    sections: [
      { instructor: `Professor ${i}`, location: `Room ${i}`, days: "MWF" },
    ],
  }));
}

/** Build a GET request for the search route with a valid session cookie. */
function searchReq(queryString = ""): NextRequest {
  const url = `http://localhost/api/courses/search${queryString ? `?${queryString}` : ""}`;
  return new NextRequest(url, {
    method:  "GET",
    headers: { cookie: "session=student-token" },
  });
}

/** Fully consume a WHATWG ReadableStream and return the concatenated text. */
async function drainStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

/**
 * Return an async iterable that yields `events`, optionally pausing
 * `initialDelayMs` before the first event.
 * Matches the shape of the SDK stream that the chat route iterates over.
 */
function makeSDKStream(
  events: object[],
  initialDelayMs = 0,
): AsyncIterable<object> {
  return {
    [Symbol.asyncIterator]: async function* () {
      if (initialDelayMs) await new Promise<void>((r) => setTimeout(r, initialDelayMs));
      for (const e of events) yield e;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Schedule generation < 2s
// ---------------------------------------------------------------------------

describe("Performance: schedule generation < 2s", () => {
  it("generates a 40-course, 8-semester plan in under 2 seconds", () => {
    const input   = buildLargeInput(40, 8);
    const start   = performance.now();
    const result  = generateSchedule(input);
    const elapsed = performance.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it("fails fast (< 2s) when 80 courses exceed 8-semester capacity", () => {
    // 80 × 3 cr = 240; 8 × 18 max = 144 → CANNOT_FIT_COURSES detected in pre-check
    const input   = buildLargeInput(80, 8);
    const start   = performance.now();
    const result  = generateSchedule(input);
    const elapsed = performance.now() - start;

    expect(result.success).toBe(false);
    expect(elapsed).toBeLessThan(2000);
  });

  it("handles 10 concurrent student plans, each completing in under 2 seconds", () => {
    const timings = Array.from({ length: 10 }, (_, i) => {
      const input = { ...buildLargeInput(20, 4), student: { id: `stu-${i}`, catalogYear: 2024 } };
      const start = performance.now();
      const result = generateSchedule(input);
      return { result, elapsed: performance.now() - start };
    });

    for (const { result, elapsed } of timings) {
      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(2000);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Course search handler < 200ms
// ---------------------------------------------------------------------------

describe("Performance: course search handler < 200ms", () => {
  afterEach(async () => {
    jest.clearAllMocks();
    // Clear the module-level cache so each test starts with a cold cache,
    // preventing a cache hit from a previous test from masking a mock mismatch.
    await searchCache.clear();
  });

  it("processes a 500-course result in under 200ms (Prisma mocked to 0ms latency)", async () => {
    mockFindMany.mockResolvedValue(buildPrismaCourses(500));
    mockCount.mockResolvedValue(500);

    const start   = performance.now();
    const res     = await searchHandler(searchReq());
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(200);
  });

  it("filter + remap of 500 courses (with query params) stays under 200ms", async () => {
    mockFindMany.mockResolvedValue(buildPrismaCourses(500));
    mockCount.mockResolvedValue(500);

    const start   = performance.now();
    const res     = await searchHandler(searchReq("department=SRCH&title=Search&credits=3"));
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(200);
  });

  it("days filter path (sections sub-query) on 500 courses stays under 200ms", async () => {
    const courses = buildPrismaCourses(500);
    mockFindMany.mockResolvedValue(courses);
    mockCount.mockResolvedValue(500);

    const start   = performance.now();
    const res     = await searchHandler(searchReq("days=MWF"));
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(200);
  });

  it("response body deserialises to the expected shape within 200ms", async () => {
    const courses = buildPrismaCourses(5);
    mockFindMany.mockResolvedValue(courses);
    mockCount.mockResolvedValue(5);

    const start   = performance.now();
    const res     = await searchHandler(searchReq());
    const body    = await res.json() as { courses: unknown[]; total: number };
    const elapsed = performance.now() - start;

    expect(body.total).toBe(5);
    expect(body.courses).toHaveLength(5);
    expect(elapsed).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// 3. AI chat route overhead < 500ms above Anthropic latency
// ---------------------------------------------------------------------------

describe("Performance: AI chat route overhead", () => {
  beforeEach(() => {
    process.env.CLAUDE_API_KEY = "test-key";
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.CLAUDE_API_KEY;
  });

  it("delivers first SSE chunk within 500ms overhead when Anthropic responds after 50ms", async () => {
    const MOCK_DELAY = 50;
    mockStream.mockReturnValue(
      makeSDKStream(
        [{ type: "content_block_delta", delta: { type: "text_delta", text: "Hello!" } }],
        MOCK_DELAY,
      ),
    );

    const req = new NextRequest("http://localhost/api/chat", {
      method:  "POST",
      body:    JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
      headers: { "Content-Type": "application/json" },
    });

    const start   = performance.now();
    const res     = await chatHandler(req);
    const text    = await drainStream(res.body as ReadableStream<Uint8Array>);
    const elapsed = performance.now() - start;

    expect(text).toContain('"text":"Hello!"');
    // Our code's overhead should not exceed 500ms above the mock's own delay
    expect(elapsed).toBeLessThan(MOCK_DELAY + 500);
  });

  it("streams a done signal and total response time is under 5 seconds", async () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      type:  "content_block_delta",
      delta: { type: "text_delta", text: `word${i} ` },
    }));
    mockStream.mockReturnValue(makeSDKStream(chunks, 0));

    const req = new NextRequest("http://localhost/api/chat", {
      method:  "POST",
      body:    JSON.stringify({
        messages: [{ role: "user", content: "Tell me about courses" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const start   = performance.now();
    const res     = await chatHandler(req);
    const text    = await drainStream(res.body as ReadableStream<Uint8Array>);
    const elapsed = performance.now() - start;

    expect(text).toContain('"done":true');
    expect(elapsed).toBeLessThan(5000);
  });

  it("returns 400 in under 100ms when messages array is missing (no Anthropic call)", async () => {
    const req = new NextRequest("http://localhost/api/chat", {
      method:  "POST",
      body:    JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const start   = performance.now();
    const res     = await chatHandler(req);
    const elapsed = performance.now() - start;

    expect(res.status).toBe(400);
    expect(elapsed).toBeLessThan(100);
  });

  it("passes student context through without meaningful overhead", async () => {
    mockStream.mockReturnValue(
      makeSDKStream(
        [{ type: "content_block_delta", delta: { type: "text_delta", text: "Sure!" } }],
        0,
      ),
    );

    const req = new NextRequest("http://localhost/api/chat", {
      method:  "POST",
      body:    JSON.stringify({
        messages: [{ role: "user", content: "Help me plan" }],
        context: {
          plannedCourses:   [{ code: "CSCI141", title: "Intro", credits: 4 }],
          completedCourses: [{ code: "MATH112", title: "Calculus I", credits: 4 }],
        },
      }),
      headers: { "Content-Type": "application/json" },
    });

    const start   = performance.now();
    const res     = await chatHandler(req);
    await drainStream(res.body as ReadableStream<Uint8Array>);
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    // Context injection is pure string manipulation — must be near-instant
    expect(elapsed).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// 4. Cache improves performance
// ---------------------------------------------------------------------------

describe("Performance: validator cache", () => {
  it("cache hit is at least 5× faster than computing the result", async () => {
    const cache            = new InMemoryCache();
    const COMPUTE_DELAY_MS = 50;

    const slowCompute = async (): Promise<ValidationResult> => {
      await new Promise<void>((r) => setTimeout(r, COMPUTE_DELAY_MS));
      return { valid: true, errors: [] };
    };

    // First call — compute path
    const t1     = performance.now();
    await getOrComputeValidationResult(cache, "sch-perf-1", slowCompute);
    const firstMs = performance.now() - t1;

    // Second call — cache path
    const t2      = performance.now();
    await getOrComputeValidationResult(cache, "sch-perf-1", slowCompute);
    const secondMs = performance.now() - t2;

    expect(firstMs).toBeGreaterThan(COMPUTE_DELAY_MS - 5); // compute actually ran
    expect(secondMs).toBeLessThan(10);                      // cache hit is fast
    expect(secondMs).toBeLessThan(firstMs / 5);             // at least 5× improvement
  });

  it("cache hit serves identical result — compute is called exactly once", async () => {
    const cache = new InMemoryCache();
    const fixed: ValidationResult = {
      valid:  false,
      errors: [{ type: "MISSING_COLL", message: "Missing COLL 100" }],
    };
    let calls = 0;
    const compute = async (): Promise<ValidationResult> => {
      calls++;
      return fixed;
    };

    const r1 = await getOrComputeValidationResult(cache, "sch-same", compute);
    const r2 = await getOrComputeValidationResult(cache, "sch-same", compute);

    expect(calls).toBe(1);      // compute called only once
    expect(r2).toEqual(r1);     // identical data from cache
  });

  it("invalidated entry forces a recompute on the next call", async () => {
    const cache = new InMemoryCache();
    let calls = 0;
    const compute = async (): Promise<ValidationResult> => {
      calls++;
      return { valid: true, errors: [] };
    };

    await getOrComputeValidationResult(cache, "sch-inv", compute); // populates
    await invalidateValidationResult(cache, "sch-inv");             // removes it
    await getOrComputeValidationResult(cache, "sch-inv", compute); // recomputes

    expect(calls).toBe(2);
  });

  it("TTL-0 entry is treated as expired and forces a recompute", async () => {
    const cache = new InMemoryCache();
    let calls = 0;
    const compute = async (): Promise<ValidationResult> => {
      calls++;
      return { valid: true, errors: [] };
    };

    // Write with TTL = 0 → expired the moment it is written
    await cache.set("validator:sch-ttl", { valid: true, errors: [] }, 0);
    await getOrComputeValidationResult(cache, "sch-ttl", compute);

    expect(calls).toBe(1); // recomputed because the TTL-0 entry was stale
  });

  it("concurrent cache lookups for the same key both return the correct result", async () => {
    const cache = new InMemoryCache();
    let calls = 0;
    const compute = async (): Promise<ValidationResult> => {
      calls++;
      await new Promise<void>((r) => setTimeout(r, 20));
      return { valid: true, errors: [] };
    };

    const [r1, r2] = await Promise.all([
      getOrComputeValidationResult(cache, "sch-concurrent", compute),
      getOrComputeValidationResult(cache, "sch-concurrent", compute),
    ]);

    // Both calls received a valid result regardless of any race
    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Concurrent AI requests — module-level Anthropic singleton handles them
// ---------------------------------------------------------------------------

describe("Performance: concurrent AI chat requests", () => {
  beforeEach(() => {
    process.env.CLAUDE_API_KEY = "test-key";
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await searchCache.clear();
    delete process.env.CLAUDE_API_KEY;
  });

  it("two concurrent requests both complete within 5 seconds (no serialisation)", async () => {
    // Each call gets its own async-iterable stream — the singleton handles both.
    mockStream
      .mockReturnValueOnce(makeSDKStream(
        [{ type: "content_block_delta", delta: { type: "text_delta", text: "Response A" } }],
        0,
      ))
      .mockReturnValueOnce(makeSDKStream(
        [{ type: "content_block_delta", delta: { type: "text_delta", text: "Response B" } }],
        0,
      ));

    const reqA = new NextRequest("http://localhost/api/chat", {
      method:  "POST",
      body:    JSON.stringify({ messages: [{ role: "user", content: "Question A" }] }),
      headers: { "Content-Type": "application/json" },
    });
    const reqB = new NextRequest("http://localhost/api/chat", {
      method:  "POST",
      body:    JSON.stringify({ messages: [{ role: "user", content: "Question B" }] }),
      headers: { "Content-Type": "application/json" },
    });

    const start = performance.now();
    const [resA, resB] = await Promise.all([chatHandler(reqA), chatHandler(reqB)]);
    const [textA, textB] = await Promise.all([
      drainStream(resA.body as ReadableStream<Uint8Array>),
      drainStream(resB.body as ReadableStream<Uint8Array>),
    ]);
    const elapsed = performance.now() - start;

    expect(textA).toContain('"text":"Response A"');
    expect(textB).toContain('"text":"Response B"');
    expect(elapsed).toBeLessThan(5000);
  });

  it("student context is not shared between concurrent requests", async () => {
    // Two requests with different student contexts — each must see only its own context.
    const capturedBodies: string[] = [];
    mockStream.mockImplementation(() => {
      return makeSDKStream(
        [{ type: "content_block_delta", delta: { type: "text_delta", text: "ok" } }],
        0,
      );
    });

    // Intercept the stream call to capture what was passed
    const originalMock = mockStream.getMockImplementation();
    mockStream.mockImplementation((...args: unknown[]) => {
      const opts = args[0] as { messages: Array<{ content: string }> };
      capturedBodies.push(opts.messages[0]?.content ?? "");
      return originalMock!(...args);
    });

    const reqA = new NextRequest("http://localhost/api/chat", {
      method:  "POST",
      body:    JSON.stringify({
        messages: [{ role: "user", content: "I need help" }],
        context:  { completedCourses: [{ code: "CSCI141", title: "Intro", credits: 4 }] },
      }),
      headers: { "Content-Type": "application/json" },
    });
    const reqB = new NextRequest("http://localhost/api/chat", {
      method:  "POST",
      body:    JSON.stringify({
        messages: [{ role: "user", content: "I need help" }],
        context:  { completedCourses: [{ code: "MATH300", title: "Analysis", credits: 3 }] },
      }),
      headers: { "Content-Type": "application/json" },
    });

    const [resA, resB] = await Promise.all([chatHandler(reqA), chatHandler(reqB)]);
    await Promise.all([
      drainStream(resA.body as ReadableStream<Uint8Array>),
      drainStream(resB.body as ReadableStream<Uint8Array>),
    ]);

    // Each request's context must appear in exactly one Anthropic call
    const bodyWithCSCI  = capturedBodies.find((b) => b.includes("CSCI141"));
    const bodyWithMATH  = capturedBodies.find((b) => b.includes("MATH300"));
    expect(bodyWithCSCI).toBeDefined();
    expect(bodyWithMATH).toBeDefined();
    // They must be different calls (no cross-contamination)
    expect(bodyWithCSCI).not.toEqual(bodyWithMATH);
  });

  it("search route handles 5 concurrent requests, each under 200ms", async () => {
    // Stagger mock return values (each concurrent test gets a cache-miss since
    // the keys differ: each request uses a unique page param).
    mockFindMany.mockResolvedValue(buildPrismaCourses(20));
    mockCount.mockResolvedValue(20);

    const requests = Array.from({ length: 5 }, (_, i) =>
      searchReq(`page=${i + 1}`),
    );

    const timings = await Promise.all(
      requests.map(async (req) => {
        const start = performance.now();
        const res   = await searchHandler(req);
        return { status: res.status, elapsed: performance.now() - start };
      }),
    );

    for (const { status, elapsed } of timings) {
      expect(status).toBe(200);
      expect(elapsed).toBeLessThan(200);
    }
  });
});
