// file: tests/observability.test.ts

/**
 * Phase 18 — Observability: integration tests
 *
 * Tests for how logging and metrics are emitted by:
 *
 *   lib/generator/logged-generator.ts    — loggedGenerateSchedule()
 *     Wraps the pure generator; emits:
 *       metric  "schedule_generation_time"  — always (success or failure)
 *       error   "schedule_generation_failed" — only when result.success === false
 *
 *   lib/ai-validator/validator.ts        — validateAISchedule()   (updated)
 *     Emits:
 *       error   "ai_validation_failed"  — only when result.valid === false
 *
 *   lib/logger/middleware.ts             — withLogging(handler)
 *     Wraps any Next.js route handler; emits:
 *       metric  "api_request"  — always, after the handler resolves
 *         data: { method, path, statusCode, durationMs }
 *
 * All tests use the injectable writer from lib/logger to capture output
 * without touching console or any external sink.
 */

import { setWriter, resetWriter, type LogEntry } from "@/lib/logger";
import { loggedGenerateSchedule } from "@/lib/generator/logged-generator";
import { validateAISchedule } from "@/lib/ai-validator/validator";
import { withLogging } from "@/lib/logger/middleware";
import { NextRequest, NextResponse } from "next/server";
import type {
  GeneratorInput,
  GeneratorCourse,
  CollRequirement,
  PlannedSemester,
} from "@/lib/generator/types";
import type {
  FullScheduleInput,
  ValidatorCourse,
  ValidatorScheduleItem,
} from "@/lib/validator/types";

// ---------------------------------------------------------------------------
// Capture helper
// ---------------------------------------------------------------------------

function capture(): LogEntry[] {
  const entries: LogEntry[] = [];
  setWriter((e) => entries.push(e));
  return entries;
}

afterEach(() => {
  resetWriter();
});

// ---------------------------------------------------------------------------
// Generator fixtures
// ---------------------------------------------------------------------------

function makeGenCourse(
  code: string,
  overrides: Partial<GeneratorCourse> = {},
): GeneratorCourse {
  return {
    code,
    credits: 3,
    prerequisiteCodes: [],
    collAttribute: null,
    seasons: ["FALL", "SPRING"],
    ...overrides,
  };
}

function makeColl(level: string, course: GeneratorCourse): CollRequirement {
  return { level, course };
}

const PLANNED_SEMS: PlannedSemester[] = [
  { year: 1, season: "FALL" },
  { year: 1, season: "SPRING" },
  { year: 2, season: "FALL" },
  { year: 2, season: "SPRING" },
];

function validGenInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    student: { id: "stu-1", catalogYear: 2024 },
    completedCourses: [],
    majorRequirements: [makeGenCourse("CSCI141")],
    collRequirements: [],
    electivePool: [],
    electiveCreditsNeeded: 0,
    plannedSemesters: PLANNED_SEMS,
    availableSections: {},
    preferences: {},
    ...overrides,
  };
}

/** Input guaranteed to trigger a COURSE_NOT_AVAILABLE error. */
function failingGenInput(): GeneratorInput {
  return validGenInput({
    majorRequirements: [makeGenCourse("CSCI141", { seasons: ["SUMMER"] })],
    // No SUMMER semester planned → COURSE_NOT_AVAILABLE
  });
}

// ---------------------------------------------------------------------------
// AI-validator fixtures
// ---------------------------------------------------------------------------

function makeValCourse(
  code: string,
  overrides: Partial<ValidatorCourse> = {},
): ValidatorCourse {
  return {
    code,
    credits: 3,
    collAttribute: null,
    alv: false,
    csi: false,
    nqr: false,
    prerequisiteCodes: [],
    ...overrides,
  };
}

function makeItem(
  courseCode: string,
  year = 1,
  season: ValidatorScheduleItem["season"] = "FALL",
  overrides: Partial<ValidatorScheduleItem> = {},
): ValidatorScheduleItem {
  return {
    courseCode,
    credits: 3,
    year,
    season,
    grade: null,
    completed: false,
    ...overrides,
  };
}

function validValInput(): FullScheduleInput {
  // 4 courses × 3 cr = 12 cr — satisfies BELOW_MINIMUM_CREDITS (min 12).
  // COLL 100 and major requirement both satisfied.
  const courses = {
    CSCI141: makeValCourse("CSCI141"),
    ENGL101: makeValCourse("ENGL101", { collAttribute: "COLL 100" }),
    HIST101: makeValCourse("HIST101"),
    MATH112: makeValCourse("MATH112"),
  };
  return {
    student: { id: "stu-1", catalogYear: 2024 },
    items: [
      makeItem("CSCI141", 1, "FALL"),
      makeItem("ENGL101", 1, "FALL"),
      makeItem("HIST101", 1, "FALL"),
      makeItem("MATH112", 1, "FALL"),
    ],
    courses,
    collRequirements:  ["COLL 100"],
    majorRequirements: ["CSCI141"],
  };
}

/** Input with a course code not present in the courses catalog. */
function invalidValInput(): FullScheduleInput {
  return {
    student: { id: "stu-1", catalogYear: 2024 },
    items: [makeItem("GHOST999")],
    courses: {},                   // GHOST999 missing → INVALID_COURSE error
    collRequirements: [],
    majorRequirements: [],
  };
}

// ===========================================================================
// A. loggedGenerateSchedule — metrics
// ===========================================================================

describe("loggedGenerateSchedule – metric emission", () => {
  it("emits a metric log on a successful generation", () => {
    const entries = capture();
    loggedGenerateSchedule(validGenInput());
    const metric = entries.find(
      (e) => e.level === "metric" && e.event === "schedule_generation_time",
    );
    expect(metric).toBeDefined();
  });

  it("emits a metric log even when generation fails", () => {
    const entries = capture();
    loggedGenerateSchedule(failingGenInput());
    const metric = entries.find(
      (e) => e.level === "metric" && e.event === "schedule_generation_time",
    );
    expect(metric).toBeDefined();
  });

  it("metric data.durationMs is a non-negative number", () => {
    const entries = capture();
    loggedGenerateSchedule(validGenInput());
    const metric = entries.find((e) => e.event === "schedule_generation_time")!;
    expect(typeof metric.data?.durationMs).toBe("number");
    expect(metric.data!.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it("metric includes the student id", () => {
    const entries = capture();
    loggedGenerateSchedule(validGenInput());
    const metric = entries.find((e) => e.event === "schedule_generation_time")!;
    expect(metric.data?.studentId).toBe("stu-1");
  });

  it("metric service is 'schedule-generator'", () => {
    const entries = capture();
    loggedGenerateSchedule(validGenInput());
    const metric = entries.find((e) => e.event === "schedule_generation_time")!;
    expect(metric.service).toBe("schedule-generator");
  });
});

// ===========================================================================
// B. loggedGenerateSchedule — failure logging
// ===========================================================================

describe("loggedGenerateSchedule – failure logging", () => {
  it("emits an error log when generation fails", () => {
    const entries = capture();
    loggedGenerateSchedule(failingGenInput());
    const errEntry = entries.find(
      (e) => e.level === "error" && e.event === "schedule_generation_failed",
    );
    expect(errEntry).toBeDefined();
  });

  it("does NOT emit an error log when generation succeeds", () => {
    const entries = capture();
    loggedGenerateSchedule(validGenInput());
    const errEntry = entries.find((e) => e.event === "schedule_generation_failed");
    expect(errEntry).toBeUndefined();
  });

  it("error log data includes the generator errors array", () => {
    const entries = capture();
    loggedGenerateSchedule(failingGenInput());
    const errEntry = entries.find((e) => e.event === "schedule_generation_failed")!;
    expect(Array.isArray(errEntry.data?.errors)).toBe(true);
    expect((errEntry.data!.errors as unknown[]).length).toBeGreaterThan(0);
  });

  it("error log data includes the student id", () => {
    const entries = capture();
    loggedGenerateSchedule(failingGenInput());
    const errEntry = entries.find((e) => e.event === "schedule_generation_failed")!;
    expect(errEntry.data?.studentId).toBe("stu-1");
  });

  it("error log service is 'schedule-generator'", () => {
    const entries = capture();
    loggedGenerateSchedule(failingGenInput());
    const errEntry = entries.find((e) => e.event === "schedule_generation_failed")!;
    expect(errEntry.service).toBe("schedule-generator");
  });

  it("loggedGenerateSchedule still returns the original GeneratorResult", () => {
    capture(); // activate writer so logs don't hit console
    const result = loggedGenerateSchedule(validGenInput());
    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
  });

  it("return value on failure still exposes errors array", () => {
    capture();
    const result = loggedGenerateSchedule(failingGenInput());
    expect(result.success).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// C. validateAISchedule — failure logging
// ===========================================================================

describe("validateAISchedule – failure logging", () => {
  it("emits an error log when validation finds errors", () => {
    const entries = capture();
    validateAISchedule(invalidValInput());
    const errEntry = entries.find(
      (e) => e.level === "error" && e.event === "ai_validation_failed",
    );
    expect(errEntry).toBeDefined();
  });

  it("does NOT emit an error log when validation passes", () => {
    const entries = capture();
    validateAISchedule(validValInput());
    const errEntry = entries.find((e) => e.event === "ai_validation_failed");
    expect(errEntry).toBeUndefined();
  });

  it("error log data includes errorCount", () => {
    const entries = capture();
    validateAISchedule(invalidValInput());
    const errEntry = entries.find((e) => e.event === "ai_validation_failed")!;
    expect(typeof errEntry.data?.errorCount).toBe("number");
    expect(errEntry.data!.errorCount as number).toBeGreaterThan(0);
  });

  it("error log data includes error types", () => {
    const entries = capture();
    validateAISchedule(invalidValInput());
    const errEntry = entries.find((e) => e.event === "ai_validation_failed")!;
    const errors = errEntry.data?.errors as Array<{ type: string }>;
    expect(Array.isArray(errors)).toBe(true);
    expect(errors[0].type).toBe("INVALID_COURSE");
  });

  it("error log service is 'ai-validator'", () => {
    const entries = capture();
    validateAISchedule(invalidValInput());
    const errEntry = entries.find((e) => e.event === "ai_validation_failed")!;
    expect(errEntry.service).toBe("ai-validator");
  });

  it("validateAISchedule still returns the original ValidationResult", () => {
    capture();
    const result = validateAISchedule(validValInput());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ===========================================================================
// D. withLogging middleware — API latency
// ===========================================================================

describe("withLogging – API latency metric", () => {
  function makeRequest(
    method = "POST",
    url = "http://localhost:3000/api/schedule/generate",
  ): NextRequest {
    return new NextRequest(url, { method });
  }

  it("emits a metric log after the handler resolves", async () => {
    const entries = capture();
    const handler = withLogging(async () =>
      NextResponse.json({ ok: true }, { status: 200 }),
    );
    await handler(makeRequest());
    const metric = entries.find(
      (e) => e.level === "metric" && e.event === "api_request",
    );
    expect(metric).toBeDefined();
  });

  it("metric data.method matches the HTTP method", async () => {
    const entries = capture();
    const handler = withLogging(async () => NextResponse.json({}, { status: 200 }));
    await handler(makeRequest("POST"));
    const metric = entries.find((e) => e.event === "api_request")!;
    expect(metric.data?.method).toBe("POST");
  });

  it("metric data.path matches the request pathname", async () => {
    const entries = capture();
    const handler = withLogging(async () => NextResponse.json({}, { status: 200 }));
    await handler(makeRequest("GET", "http://localhost:3000/api/health"));
    const metric = entries.find((e) => e.event === "api_request")!;
    expect(metric.data?.path).toBe("/api/health");
  });

  it("metric data.statusCode matches the response status", async () => {
    const entries = capture();
    const handler = withLogging(async () => NextResponse.json({}, { status: 201 }));
    await handler(makeRequest());
    const metric = entries.find((e) => e.event === "api_request")!;
    expect(metric.data?.statusCode).toBe(201);
  });

  it("metric data.durationMs is a non-negative number", async () => {
    const entries = capture();
    const handler = withLogging(async () => NextResponse.json({}, { status: 200 }));
    await handler(makeRequest());
    const metric = entries.find((e) => e.event === "api_request")!;
    expect(typeof metric.data?.durationMs).toBe("number");
    expect(metric.data!.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it("emits a metric even when the handler returns a non-2xx status", async () => {
    const entries = capture();
    const handler = withLogging(async () =>
      NextResponse.json({ error: "bad" }, { status: 422 }),
    );
    await handler(makeRequest());
    const metric = entries.find((e) => e.event === "api_request")!;
    expect(metric).toBeDefined();
    expect(metric.data?.statusCode).toBe(422);
  });

  it("metric service is 'api'", async () => {
    const entries = capture();
    const handler = withLogging(async () => NextResponse.json({}, { status: 200 }));
    await handler(makeRequest());
    const metric = entries.find((e) => e.event === "api_request")!;
    expect(metric.service).toBe("api");
  });

  it("withLogging returns the original response from the handler", async () => {
    capture();
    const handler = withLogging(async () =>
      NextResponse.json({ result: "ok" }, { status: 200 }),
    );
    const response = await handler(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toBe("ok");
  });

  it("still emits a metric when handler throws (error is re-thrown)", async () => {
    const entries = capture();
    const handler = withLogging(async () => {
      throw new Error("handler exploded");
    });
    await expect(handler(makeRequest())).rejects.toThrow("handler exploded");
    const metric = entries.find((e) => e.event === "api_request");
    expect(metric).toBeDefined();
  });
});

// ===========================================================================
// E. Structured log format (cross-cutting)
// ===========================================================================

describe("structured log format", () => {
  it("schedule generation metric conforms to the log schema", () => {
    const entries = capture();
    loggedGenerateSchedule(validGenInput());
    const entry = entries.find((e) => e.event === "schedule_generation_time")!;
    expect(entry).toMatchObject({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      level:     "metric",
      service:   "schedule-generator",
      event:     "schedule_generation_time",
      data:      expect.objectContaining({ durationMs: expect.any(Number) }),
    });
  });

  it("schedule generation error conforms to the log schema", () => {
    const entries = capture();
    loggedGenerateSchedule(failingGenInput());
    const entry = entries.find((e) => e.event === "schedule_generation_failed")!;
    expect(entry).toMatchObject({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      level:     "error",
      service:   "schedule-generator",
      event:     "schedule_generation_failed",
    });
  });

  it("AI validation error conforms to the log schema", () => {
    const entries = capture();
    validateAISchedule(invalidValInput());
    const entry = entries.find((e) => e.event === "ai_validation_failed")!;
    expect(entry).toMatchObject({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      level:     "error",
      service:   "ai-validator",
      event:     "ai_validation_failed",
      data:      expect.objectContaining({ errorCount: expect.any(Number) }),
    });
  });

  it("API latency metric conforms to the log schema", async () => {
    const entries = capture();
    const handler = withLogging(async () => NextResponse.json({}, { status: 200 }));
    await handler(
      new NextRequest("http://localhost:3000/api/health", { method: "GET" }),
    );
    const entry = entries.find((e) => e.event === "api_request")!;
    expect(entry).toMatchObject({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      level:     "metric",
      service:   "api",
      event:     "api_request",
      data:      expect.objectContaining({
        method:     expect.any(String),
        path:       expect.any(String),
        statusCode: expect.any(Number),
        durationMs: expect.any(Number),
      }),
    });
  });
});
