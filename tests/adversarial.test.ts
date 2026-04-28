// file: tests/adversarial.test.ts
//
// Phase 20 — Adversarial & Edge-Case Testing (Node environment)
//
// Covers:
//   1. Senior with 60+ credits (generator — packing into few remaining semesters)
//   2. Double major (generator — shared prerequisite placed exactly once)
//   3. Course removed from catalog (generator + AI validator)
//   4. Changed prerequisites — catalog year is caller-controlled (AI validator)
//   5. Transfer credits (generator treats completedCourses as satisfied prereqs)
//   6. Concurrent requests (logger writer + withLogging metrics)
//   7. API resilience — Prisma failure returns 500 rather than crashing

// ---------------------------------------------------------------------------
// Module mocks (hoisted before any imports)
// ---------------------------------------------------------------------------

// Supabase — required by withRole middleware used in the search route
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async (token: string) => {
        const users: Record<string, object> = {
          "student-token": {
            id: "student-123",
            email: "student@wm.edu",
            user_metadata: { role: "student" },
          },
        };
        const user = users[token];
        if (user) return { data: { user }, error: null };
        return { data: { user: null }, error: { message: "Invalid token", status: 401 } };
      }),
    },
  })),
}));

// Prisma — lets individual tests control DB behaviour (success vs. throw)
jest.mock("@/lib/db", () => ({
  prisma: {
    course: {
      findMany: jest.fn(),
      count:    jest.fn(),
    },
    scheduleItem: { findMany: jest.fn() },
    requirement:  { findMany: jest.fn() },
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";

import { generateSchedule }       from "@/lib/generator/generator";
import { loggedGenerateSchedule } from "@/lib/generator/logged-generator";
import { validateAISchedule }     from "@/lib/ai-validator/validator";
import { setWriter, resetWriter } from "@/lib/logger";
import { withLogging }            from "@/lib/logger/middleware";
import type { LogEntry }          from "@/lib/logger";
import { GET as searchHandler }   from "@/app/api/courses/search/route";
import { prisma }                 from "@/lib/db";

import type {
  GeneratorInput,
  GeneratorCourse,
  CompletedCourse,
  PlannedSemester,
  Season,
} from "@/lib/generator/types";
import type {
  FullScheduleInput,
  ValidatorCourse,
  ValidatorScheduleItem,
} from "@/lib/validator/types";

// ---------------------------------------------------------------------------
// Typed mock refs
// ---------------------------------------------------------------------------

const mockCourseFindMany = prisma.course.findMany as jest.Mock;
const mockCourseCount    = prisma.course.count    as jest.Mock;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function genCourse(
  code: string,
  overrides: Partial<GeneratorCourse> = {},
): GeneratorCourse {
  return {
    code,
    credits: 3,
    prerequisiteCodes: [],
    collAttribute: null,
    seasons: ["FALL", "SPRING"] as Season[],
    ...overrides,
  };
}

function completed(
  code: string,
  credits = 3,
  year = 2022,
  season: Season = "FALL",
): CompletedCourse {
  return { code, credits, year, season };
}

function semester(year: number, season: Season): PlannedSemester {
  return { year, season };
}

function baseInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    student:               { id: "stu-test", catalogYear: 2024 },
    completedCourses:      [],
    majorRequirements:     [],
    collRequirements:      [],
    electivePool:          [],
    electiveCreditsNeeded: 0,
    plannedSemesters:      [semester(2025, "FALL"), semester(2026, "SPRING")],
    availableSections:     {},
    preferences:           {},
    ...overrides,
  };
}

function valItem(
  courseCode: string,
  year: number,
  season: "FALL" | "SPRING",
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

function valCourse(
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

function buildValidatorInput(overrides: Partial<FullScheduleInput> = {}): FullScheduleInput {
  return {
    student: { id: "stu-1", catalogYear: 2024 },
    items: [],
    courses: {},
    collRequirements: [],
    majorRequirements: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Senior with 60+ completed credits (generator)
// ---------------------------------------------------------------------------

describe("Adversarial: senior with 60+ completed credits (generator)", () => {
  // Build a pool of already-completed courses adding up to ~66 credits
  const completed66: CompletedCourse[] = Array.from({ length: 22 }, (_, i) =>
    completed(`DONE${String(i + 1).padStart(3, "0")}`, 3, 2022, i % 2 === 0 ? "FALL" : "SPRING"),
  );

  // Two required courses left to place in 2 remaining semesters
  const remaining = [
    genCourse("CSCI400", { credits: 4, seasons: ["FALL"] }),
    genCourse("CSCI401", { credits: 4, seasons: ["SPRING"] }),
  ];

  it("generates a valid plan for a senior with only 2 remaining semesters", () => {
    const result = generateSchedule(
      baseInput({
        completedCourses:  completed66,
        majorRequirements: remaining,
        plannedSemesters:  [semester(2025, "FALL"), semester(2026, "SPRING")],
      }),
    );
    expect(result.success).toBe(true);
    expect(result.plan!.semesters).toHaveLength(2);
  });

  it("does not re-place any of the 22 already-completed courses", () => {
    const result = generateSchedule(
      baseInput({
        completedCourses:  completed66,
        majorRequirements: remaining,
        plannedSemesters:  [semester(2025, "FALL"), semester(2026, "SPRING")],
      }),
    );
    const allPlacedCodes = result.plan!.semesters.flatMap((s) =>
      s.courses.map((c) => c.code),
    );
    const completedCodes = new Set(completed66.map((c) => c.code));
    for (const code of allPlacedCodes) {
      expect(completedCodes.has(code)).toBe(false);
    }
  });

  it("returns CANNOT_FIT_COURSES when remaining required credits exceed available capacity", () => {
    // 10 courses × 4 cr = 40 required credits; 2 semesters × 18 max = 36 capacity
    const tooMany = Array.from({ length: 10 }, (_, i) =>
      genCourse(`LATE${i}`, { credits: 4 }),
    );
    const result = generateSchedule(
      baseInput({
        completedCourses:  completed66,
        majorRequirements: tooMany,
        plannedSemesters:  [semester(2025, "FALL"), semester(2026, "SPRING")],
      }),
    );
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "CANNOT_FIT_COURSES" }),
      ]),
    );
  });

  it("counts completed courses as satisfied prerequisites even after 60+ credits", () => {
    // ADVA400 requires DONE001 (which is completed)
    const chain = [genCourse("ADVA400", { prerequisiteCodes: ["DONE001"] })];
    const result = generateSchedule(
      baseInput({
        completedCourses:  completed66,
        majorRequirements: chain,
        plannedSemesters:  [semester(2025, "FALL")],
      }),
    );
    expect(result.success).toBe(true);
    const placed = result.plan!.semesters.flatMap((s) => s.courses.map((c) => c.code));
    expect(placed).toContain("ADVA400");
  });
});

// ---------------------------------------------------------------------------
// 2. Double major — generator places shared prerequisite exactly once
// ---------------------------------------------------------------------------

describe("Adversarial: double major — shared prerequisite placed once", () => {
  // MATH200 is a prerequisite for both CS400 (CS major) and ECON300 (Econ major).
  // MATH200 itself has no prerequisites.
  const sharedPrereq = genCourse("MATH200");
  const csMajorCourse   = genCourse("CS400",   { prerequisiteCodes: ["MATH200"] });
  const econMajorCourse = genCourse("ECON300",  { prerequisiteCodes: ["MATH200"] });

  const combined = [sharedPrereq, csMajorCourse, econMajorCourse];

  const fourSemesters: PlannedSemester[] = [
    semester(2024, "FALL"),
    semester(2025, "SPRING"),
    semester(2025, "FALL"),
    semester(2026, "SPRING"),
  ];

  let allCodes: string[];

  beforeAll(() => {
    const result = generateSchedule(
      baseInput({ majorRequirements: combined, plannedSemesters: fourSemesters }),
    );
    expect(result.success).toBe(true);
    allCodes = result.plan!.semesters.flatMap((s) => s.courses.map((c) => c.code));
  });

  it("places every course from both majors in the plan", () => {
    expect(allCodes).toContain("MATH200");
    expect(allCodes).toContain("CS400");
    expect(allCodes).toContain("ECON300");
  });

  it("places the shared prerequisite exactly once (not duplicated for each major)", () => {
    const math200Count = allCodes.filter((c) => c === "MATH200").length;
    expect(math200Count).toBe(1);
  });

  it("places MATH200 strictly before both CS400 and ECON300", () => {
    const result = generateSchedule(
      baseInput({ majorRequirements: combined, plannedSemesters: fourSemesters }),
    );
    const sems = result.plan!.semesters;
    const idxMath = sems.findIndex((s) => s.courses.some((c) => c.code === "MATH200"));
    const idxCS   = sems.findIndex((s) => s.courses.some((c) => c.code === "CS400"));
    const idxEcon = sems.findIndex((s) => s.courses.some((c) => c.code === "ECON300"));
    expect(idxMath).toBeLessThan(idxCS);
    expect(idxMath).toBeLessThan(idxEcon);
  });

  it("handles overlapping elective pools across both majors without duplication", () => {
    // If the same elective satisfies both majors, it should appear only once
    const sharedElective = genCourse("ELEC500");
    const result = generateSchedule(
      baseInput({
        majorRequirements: [...combined, sharedElective],
        plannedSemesters:  fourSemesters,
      }),
    );
    expect(result.success).toBe(true);
    const codes = result.plan!.semesters.flatMap((s) => s.courses.map((c) => c.code));
    expect(codes.filter((c) => c === "ELEC500").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Course removed from catalog
// ---------------------------------------------------------------------------

describe("Adversarial: course removed from catalog", () => {
  // ── Generator side ─────────────────────────────────────────────────────────

  describe("generator: completed course not in majorRequirements still satisfies prereqs", () => {
    it("places a dependent course whose prerequisite was completed but is no longer required", () => {
      // LEGACY001 was removed from the catalog / major requirements, but the student
      // completed it.  CURR200 still requires it as a prerequisite.
      const result = generateSchedule(
        baseInput({
          completedCourses:  [completed("LEGACY001", 3, 2022, "FALL")],
          majorRequirements: [genCourse("CURR200", { prerequisiteCodes: ["LEGACY001"] })],
          plannedSemesters:  [semester(2025, "FALL")],
        }),
      );
      expect(result.success).toBe(true);
      const codes = result.plan!.semesters.flatMap((s) => s.courses.map((c) => c.code));
      expect(codes).toContain("CURR200");
      expect(codes).not.toContain("LEGACY001"); // not re-placed
    });
  });

  // ── AI Validator side ───────────────────────────────────────────────────────

  describe("AI validator: future course not in catalog → INVALID_COURSE", () => {
    it("flags a non-completed future course that no longer exists in the catalog", () => {
      const input = buildValidatorInput({
        items: [
          // Future planned course that was removed from the catalog
          valItem("GONE101", 2026, "FALL", { completed: false }),
          // Pad to meet 12-credit minimum
          valItem("REAL101", 2026, "FALL"),
          valItem("REAL102", 2026, "FALL"),
          valItem("REAL103", 2026, "FALL"),
        ],
        courses: {
          // GONE101 intentionally absent — it was removed from the catalog
          REAL101: valCourse("REAL101"),
          REAL102: valCourse("REAL102"),
          REAL103: valCourse("REAL103"),
        },
      });
      const result = validateAISchedule(input);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "INVALID_COURSE", courseCode: "GONE101" }),
        ]),
      );
    });

    it("does not flag a completed past course that is no longer in the catalog", () => {
      // The student completed OLD101 in 2022; it has since been removed from the catalog.
      // Completed items represent history and should not be penalised.
      const input = buildValidatorInput({
        items: [
          valItem("OLD101", 2022, "FALL", { completed: true }),
          valItem("REAL101", 2026, "FALL"),
          valItem("REAL102", 2026, "FALL"),
          valItem("REAL103", 2026, "FALL"),
          valItem("REAL104", 2026, "FALL"),
        ],
        courses: {
          // OLD101 absent — removed from catalog after the student completed it
          REAL101: valCourse("REAL101"),
          REAL102: valCourse("REAL102"),
          REAL103: valCourse("REAL103"),
          REAL104: valCourse("REAL104"),
        },
      });
      const result = validateAISchedule(input);
      const invalidErrors = result.errors.filter(
        (e) => e.type === "INVALID_COURSE" && e.courseCode === "OLD101",
      );
      // A completed historical course must not be flagged as invalid
      expect(invalidErrors).toHaveLength(0);
    });

    it("correctly distinguishes: completed removed course (ok) vs future removed course (flagged)", () => {
      const input = buildValidatorInput({
        items: [
          valItem("OLD001", 2022, "FALL", { completed: true }),  // historical — ok
          valItem("GONE101", 2026, "FALL", { completed: false }), // future — flagged
          valItem("REAL101", 2026, "FALL"),
          valItem("REAL102", 2026, "FALL"),
          valItem("REAL103", 2026, "FALL"),
        ],
        courses: {
          REAL101: valCourse("REAL101"),
          REAL102: valCourse("REAL102"),
          REAL103: valCourse("REAL103"),
        },
      });
      const result = validateAISchedule(input);
      const invalidCodes = result.errors
        .filter((e) => e.type === "INVALID_COURSE")
        .map((e) => e.courseCode);

      expect(invalidCodes).toContain("GONE101");
      expect(invalidCodes).not.toContain("OLD001");
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Changed prerequisites — catalog year is caller-controlled
// ---------------------------------------------------------------------------

describe("Adversarial: changed prerequisites — catalog year is caller-controlled", () => {
  // HIST200 had NO prerequisite in catalog year 2023.
  // In 2024 the department added HIST100 as a prerequisite.
  // A student with catalogYear 2023 enrolled in HIST200 without HIST100.
  // The system must not penalise them IF the 2023 catalog is supplied.

  const histItem = valItem("HIST200", 2023, "FALL", { completed: true });
  const paddingItems = [
    valItem("ENGL101", 2023, "FALL"),
    valItem("MATH101", 2023, "FALL"),
    valItem("BIOL101", 2023, "FALL"),
  ];

  it("produces no PREREQUISITE_NOT_MET when validated against the 2023 catalog (no prereq)", () => {
    const catalog2023 = {
      HIST200: valCourse("HIST200", { prerequisiteCodes: [] }), // no prereq in 2023
      ENGL101: valCourse("ENGL101"),
      MATH101: valCourse("MATH101"),
      BIOL101: valCourse("BIOL101"),
    };
    const result = validateAISchedule(
      buildValidatorInput({ items: [histItem, ...paddingItems], courses: catalog2023 }),
    );
    const prereqErrors = result.errors.filter((e) => e.type === "PREREQUISITE_NOT_MET");
    expect(prereqErrors).toHaveLength(0);
  });

  it("produces PREREQUISITE_NOT_MET when (incorrectly) validated against the 2024 catalog", () => {
    // Documents that passing the wrong catalog year breaks version-safety.
    const catalog2024 = {
      HIST100: valCourse("HIST100"),
      HIST200: valCourse("HIST200", { prerequisiteCodes: ["HIST100"] }), // added in 2024
      ENGL101: valCourse("ENGL101"),
      MATH101: valCourse("MATH101"),
      BIOL101: valCourse("BIOL101"),
    };
    const result = validateAISchedule(
      buildValidatorInput({ items: [histItem, ...paddingItems], courses: catalog2024 }),
    );
    const prereqErrors = result.errors.filter((e) => e.type === "PREREQUISITE_NOT_MET");
    // The 2024 catalog falsely penalises a valid 2023 enrollment —
    // confirming that the API layer MUST pass the student's catalog year.
    expect(prereqErrors.length).toBeGreaterThan(0);
  });

  it("documents: the validator is version-neutral; version-safety is the caller's responsibility", () => {
    // This test exists as executable documentation of the architectural contract:
    // validateAISchedule uses whatever prerequisiteCodes appear in the courses map.
    // It is the route handler's responsibility to pass the correct versioned catalog.
    const catalogWithNoPrereqs = {
      HIST200: valCourse("HIST200", { prerequisiteCodes: [] }),
      ENGL101: valCourse("ENGL101"),
      MATH101: valCourse("MATH101"),
      BIOL101: valCourse("BIOL101"),
    };
    const catalogWithPrereqs = {
      HIST100: valCourse("HIST100"),
      HIST200: valCourse("HIST200", { prerequisiteCodes: ["HIST100"] }),
      ENGL101: valCourse("ENGL101"),
      MATH101: valCourse("MATH101"),
      BIOL101: valCourse("BIOL101"),
    };
    const resultA = validateAISchedule(
      buildValidatorInput({ items: [histItem, ...paddingItems], courses: catalogWithNoPrereqs }),
    );
    const resultB = validateAISchedule(
      buildValidatorInput({ items: [histItem, ...paddingItems], courses: catalogWithPrereqs }),
    );
    // Same schedule, same student, different catalog → different validation outcomes.
    const prereqErrorsA = resultA.errors.filter((e) => e.type === "PREREQUISITE_NOT_MET").length;
    const prereqErrorsB = resultB.errors.filter((e) => e.type === "PREREQUISITE_NOT_MET").length;
    expect(prereqErrorsA).toBe(0);
    expect(prereqErrorsB).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Transfer credits — generator treats completedCourses as satisfied prereqs
// ---------------------------------------------------------------------------

describe("Adversarial: transfer credits (generator)", () => {
  // Transfer credits arrive as CompletedCourse entries (same shape as W&M-completed courses).

  it("does not re-place a transferred course that appears in majorRequirements", () => {
    // Student transferred CALC101; it is still listed in majorRequirements.
    const result = generateSchedule(
      baseInput({
        completedCourses:  [completed("CALC101", 4, 2023, "SPRING")],
        majorRequirements: [genCourse("CALC101", { credits: 4 })],
        plannedSemesters:  [semester(2025, "FALL")],
      }),
    );
    expect(result.success).toBe(true);
    const codes = result.plan!.semesters.flatMap((s) => s.courses.map((c) => c.code));
    expect(codes).not.toContain("CALC101");
  });

  it("accepts a transferred course as a satisfied prerequisite for a subsequent course", () => {
    // CALC101 was transferred; CALC201 requires it.
    const result = generateSchedule(
      baseInput({
        completedCourses:  [completed("CALC101", 4, 2023, "SPRING")],
        majorRequirements: [genCourse("CALC201", { prerequisiteCodes: ["CALC101"] })],
        plannedSemesters:  [semester(2025, "FALL")],
      }),
    );
    expect(result.success).toBe(true);
    const codes = result.plan!.semesters.flatMap((s) => s.courses.map((c) => c.code));
    expect(codes).toContain("CALC201");
  });

  it("handles a large transfer block (15 courses) without exceeding any semester's 18-credit cap", () => {
    const transfers: CompletedCourse[] = Array.from({ length: 15 }, (_, i) =>
      completed(`TR${String(i + 1).padStart(3, "0")}`, 3, 2023, i % 2 === 0 ? "FALL" : "SPRING"),
    );
    // Only 2 courses left to place
    const result = generateSchedule(
      baseInput({
        completedCourses:  transfers,
        majorRequirements: [genCourse("SENR400"), genCourse("SENR401")],
        plannedSemesters:  [semester(2025, "FALL"), semester(2026, "SPRING")],
      }),
    );
    expect(result.success).toBe(true);
    for (const sem of result.plan!.semesters) {
      expect(sem.totalCredits).toBeLessThanOrEqual(18);
    }
  });

  it("builds a chain through a mix of transferred and in-program prerequisites", () => {
    // TRAN001 (transferred) → PROG200 (in plan) → PROG300 (in plan)
    const result = generateSchedule(
      baseInput({
        completedCourses:  [completed("TRAN001", 3, 2023, "FALL")],
        majorRequirements: [
          genCourse("PROG200", { prerequisiteCodes: ["TRAN001"] }),
          genCourse("PROG300", { prerequisiteCodes: ["PROG200"] }),
        ],
        plannedSemesters: [
          semester(2025, "FALL"),
          semester(2026, "SPRING"),
          semester(2026, "FALL"),
        ],
      }),
    );
    expect(result.success).toBe(true);
    const sems = result.plan!.semesters;
    const idxProg200 = sems.findIndex((s) => s.courses.some((c) => c.code === "PROG200"));
    const idxProg300 = sems.findIndex((s) => s.courses.some((c) => c.code === "PROG300"));
    expect(idxProg200).toBeLessThan(idxProg300);
    expect(idxProg200).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Concurrent requests — logger writer and withLogging metrics
// ---------------------------------------------------------------------------

describe("Adversarial: concurrent requests — logger and withLogging metrics", () => {
  afterEach(() => {
    resetWriter();
    jest.clearAllMocks();
  });

  it("loggedGenerateSchedule emits separate metric entries for each concurrent call", async () => {
    const entries: LogEntry[] = [];
    setWriter((e) => entries.push(e));

    const inputA = baseInput({
      student:           { id: "student-A", catalogYear: 2024 },
      majorRequirements: [genCourse("CONA100")],
      plannedSemesters:  [semester(2025, "FALL")],
    });
    const inputB = baseInput({
      student:           { id: "student-B", catalogYear: 2024 },
      majorRequirements: [genCourse("CONB100")],
      plannedSemesters:  [semester(2025, "SPRING")],
    });

    // Fire both calls — in JS these execute sequentially, but the writer must
    // record each call's studentId independently (no cross-contamination).
    await Promise.all([
      Promise.resolve(loggedGenerateSchedule(inputA)),
      Promise.resolve(loggedGenerateSchedule(inputB)),
    ]);

    const timeMetrics = entries.filter((e) => e.event === "schedule_generation_time");
    expect(timeMetrics).toHaveLength(2);

    const studentIds = timeMetrics.map((e) => e.data?.studentId);
    expect(studentIds).toContain("student-A");
    expect(studentIds).toContain("student-B");
  });

  it("each loggedGenerateSchedule call's metric carries its own durationMs", async () => {
    const entries: LogEntry[] = [];
    setWriter((e) => entries.push(e));

    const input = baseInput({ student: { id: "stu-dur", catalogYear: 2024 } });
    loggedGenerateSchedule(input);
    loggedGenerateSchedule(input);

    const metrics = entries.filter((e) => e.event === "schedule_generation_time");
    expect(metrics).toHaveLength(2);
    for (const m of metrics) {
      expect(typeof m.data?.durationMs).toBe("number");
      expect(m.data!.durationMs as number).toBeGreaterThanOrEqual(0);
    }
  });

  it("withLogging emits exactly one api_request metric per request under concurrent load", async () => {
    const entries: LogEntry[] = [];
    setWriter((e) => entries.push(e));

    const handler = jest.fn(async () =>
      NextResponse.json({ ok: true }, { status: 200 }),
    );
    const wrapped = withLogging(handler);

    await Promise.all([
      wrapped(new NextRequest("http://localhost/api/con-a", { method: "GET" })),
      wrapped(new NextRequest("http://localhost/api/con-b", { method: "GET" })),
    ]);

    const apiMetrics = entries.filter((e) => e.event === "api_request");
    expect(apiMetrics).toHaveLength(2);

    const paths = apiMetrics.map((e) => e.data?.path);
    expect(paths).toContain("/api/con-a");
    expect(paths).toContain("/api/con-b");
  });

  it("withLogging still emits the metric when the handler throws", async () => {
    const entries: LogEntry[] = [];
    setWriter((e) => entries.push(e));

    const boom = jest.fn(async (): Promise<NextResponse> => {
      throw new Error("handler exploded");
    });
    const wrapped = withLogging(boom);

    await expect(
      wrapped(new NextRequest("http://localhost/api/boom", { method: "POST" })),
    ).rejects.toThrow("handler exploded");

    const metric = entries.find((e) => e.event === "api_request");
    expect(metric).toBeDefined();
    // Status code should be 500 (the fallback initialised in withLogging)
    expect(metric!.data?.statusCode).toBe(500);
  });

  it("failed generation emits both a time metric and a failure error log", () => {
    const entries: LogEntry[] = [];
    setWriter((e) => entries.push(e));

    // Circular dependency → generator fails
    const cyclicInput = baseInput({
      student:           { id: "stu-cycle", catalogYear: 2024 },
      majorRequirements: [
        genCourse("CYC001", { prerequisiteCodes: ["CYC002"] }),
        genCourse("CYC002", { prerequisiteCodes: ["CYC001"] }),
      ],
    });
    loggedGenerateSchedule(cyclicInput);

    const timeMetric    = entries.find((e) => e.event === "schedule_generation_time");
    const failureEntry  = entries.find((e) => e.event === "schedule_generation_failed");

    expect(timeMetric).toBeDefined();
    expect(failureEntry).toBeDefined();
    expect(failureEntry!.data?.studentId).toBe("stu-cycle");
    expect(Array.isArray(failureEntry!.data?.errors)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. API resilience — Prisma failure returns 500
// ---------------------------------------------------------------------------

describe("Adversarial: API resilience when Prisma throws", () => {
  afterEach(() => jest.clearAllMocks());

  async function callSearch(cookie = "session=student-token"): Promise<Response> {
    const req = new NextRequest("http://localhost/api/courses/search", {
      method: "GET",
      headers: { cookie },
    });
    return searchHandler(req);
  }

  it("GET /api/courses/search returns 500 when prisma.course.findMany rejects", async () => {
    mockCourseFindMany.mockRejectedValue(new Error("DB connection lost"));
    mockCourseCount.mockResolvedValue(0);

    const res = await callSearch();
    expect(res.status).toBe(500);
  });

  it("GET /api/courses/search returns 500 when prisma.course.count rejects", async () => {
    mockCourseFindMany.mockResolvedValue([]);
    mockCourseCount.mockRejectedValue(new Error("query timeout"));

    const res = await callSearch();
    expect(res.status).toBe(500);
  });

  it("GET /api/courses/search returns 401 for a missing session cookie (not a DB error)", async () => {
    // Sanity check: auth failures still work normally when Prisma is healthy
    mockCourseFindMany.mockResolvedValue([]);
    mockCourseCount.mockResolvedValue(0);

    const res = await callSearch(""); // no cookie
    expect(res.status).toBe(401);
  });
});
