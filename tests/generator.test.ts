// file: tests/generator.test.ts

import { generateSchedule } from "@/lib/generator/generator";
import type {
  GeneratorInput,
  GeneratorCourse,
  CollRequirement,
  CompletedCourse,
  PlannedSemester,
  SectionOption,
  GeneratorResult,
  GeneratedSemester,
  PlacedCourse,
  Season,
  SchedulePreferences,
} from "@/lib/generator/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCourse(
  code: string,
  overrides: Partial<GeneratorCourse> = {}
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

function makeSection(
  id: string,
  season: Season,
  year: number,
  overrides: Partial<SectionOption> = {}
): SectionOption {
  return {
    id,
    crn: `CRN-${id}`,
    days: "MWF",
    startTime: "10:00am",
    endTime: "10:50am",
    year,
    season,
    ...overrides,
  };
}

/** Index of the semester containing the given course code, or -1. */
function semesterOf(semesters: GeneratedSemester[], code: string): number {
  return semesters.findIndex((s) => s.courses.some((c) => c.code === code));
}

/** PlacedCourse for a given code across all semesters, or undefined. */
function findCourse(
  semesters: GeneratedSemester[],
  code: string
): PlacedCourse | undefined {
  for (const sem of semesters) {
    const found = sem.courses.find((c) => c.code === code);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const EIGHT_SEMESTERS: PlannedSemester[] = [
  { year: 2024, season: "FALL" },
  { year: 2025, season: "SPRING" },
  { year: 2025, season: "FALL" },
  { year: 2026, season: "SPRING" },
  { year: 2026, season: "FALL" },
  { year: 2027, season: "SPRING" },
  { year: 2027, season: "FALL" },
  { year: 2028, season: "SPRING" },
];

// CS major: 4+4+3+3+3+4+3+3 = 27 credits, with a prerequisite chain.
const CS_MAJOR: GeneratorCourse[] = [
  makeCourse("CSCI141", { credits: 4 }),
  makeCourse("CSCI142", { credits: 4, prerequisiteCodes: ["CSCI141"] }),
  makeCourse("CSCI301", { credits: 3, prerequisiteCodes: ["CSCI142"], seasons: ["FALL"] }),
  makeCourse("CSCI303", { credits: 3, prerequisiteCodes: ["CSCI142"], seasons: ["SPRING"] }),
  makeCourse("CSCI315", { credits: 3, prerequisiteCodes: ["CSCI301", "CSCI303"] }),
  makeCourse("MATH112", { credits: 4 }),
  makeCourse("MATH211", { credits: 3, prerequisiteCodes: ["MATH112"] }),
  makeCourse("MATH214", { credits: 3, prerequisiteCodes: ["MATH112"] }),
];

// COLL requirements: 3+4+3+3+1 = 14 credits.
const COLL_REQS: CollRequirement[] = [
  { level: "COLL 100", course: makeCourse("COLL100", { credits: 3, collAttribute: "COLL 100" }) },
  { level: "COLL 150", course: makeCourse("FYSE101", { credits: 4, collAttribute: "COLL 150" }) },
  { level: "COLL 200", course: makeCourse("ENGL200", { credits: 3, collAttribute: "COLL 200" }) },
  { level: "COLL 300", course: makeCourse("HIST300", { credits: 3, collAttribute: "COLL 300" }) },
  { level: "COLL 400", course: makeCourse("COLL400", { credits: 1, collAttribute: "COLL 400" }) },
];

// 30 generic 3-credit electives offered FALL + SPRING.
const ELECTIVE_POOL: GeneratorCourse[] = Array.from({ length: 30 }, (_, i) =>
  makeCourse(`ELEC${String(i + 1).padStart(3, "0")}`)
);

// Total required: 27 (major) + 14 (COLL) = 41 credits.
// electiveCreditsNeeded = 79 → generator picks 27 × 3 = 81 elective credits → ~122 total.
function buildInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    student: { id: "stu-1", catalogYear: 2024 },
    completedCourses: [],
    majorRequirements: CS_MAJOR,
    collRequirements: COLL_REQS,
    electivePool: ELECTIVE_POOL,
    electiveCreditsNeeded: 79,
    plannedSemesters: EIGHT_SEMESTERS,
    availableSections: {},
    preferences: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateSchedule()", () => {

  // ── Plan structure ──────────────────────────────────────────────────────────

  describe("plan structure", () => {
    let result: GeneratorResult;

    beforeAll(() => {
      result = generateSchedule(buildInput());
    });

    it("returns success:true for a valid input", () => {
      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
    });

    it("produces exactly one entry per planned semester", () => {
      expect(result.plan!.semesters).toHaveLength(8);
    });

    it("places every major requirement course exactly once", () => {
      const allCodes = result.plan!.semesters.flatMap((s) =>
        s.courses.map((c) => c.code)
      );
      for (const course of CS_MAJOR) {
        expect(allCodes.filter((c) => c === course.code)).toHaveLength(1);
      }
    });

    it("places every COLL requirement course exactly once", () => {
      const allCodes = result.plan!.semesters.flatMap((s) =>
        s.courses.map((c) => c.code)
      );
      for (const req of COLL_REQS) {
        expect(allCodes.filter((c) => c === req.course.code)).toHaveLength(1);
      }
    });

    it("total planned credits reach at least 120", () => {
      expect(result.plan!.totalCredits).toBeGreaterThanOrEqual(120);
    });

    it("no semester exceeds the 18-credit maximum", () => {
      for (const sem of result.plan!.semesters) {
        expect(sem.totalCredits).toBeLessThanOrEqual(18);
      }
    });

    it("each semester's totalCredits equals the sum of its placed course credits", () => {
      for (const sem of result.plan!.semesters) {
        const sum = sem.courses.reduce((acc, c) => acc + c.credits, 0);
        expect(sem.totalCredits).toBe(sum);
      }
    });

    it("no course appears in more than one semester", () => {
      const allCodes = result.plan!.semesters.flatMap((s) =>
        s.courses.map((c) => c.code)
      );
      expect(allCodes.length).toBe(new Set(allCodes).size);
    });
  });

  // ── Partial plan (continuing student) ──────────────────────────────────────

  describe("partial plan (continuing student)", () => {
    // 3-course chain: CS100 → CS200 → CS300. Student already completed CS100.
    const smallMajor: GeneratorCourse[] = [
      makeCourse("CS100", { credits: 3 }),
      makeCourse("CS200", { credits: 3, prerequisiteCodes: ["CS100"] }),
      makeCourse("CS300", { credits: 3, prerequisiteCodes: ["CS200"] }),
    ];

    const completed: CompletedCourse[] = [
      { code: "CS100", credits: 3, year: 2024, season: "FALL" },
    ];

    const remaining: PlannedSemester[] = [
      { year: 2025, season: "SPRING" },
      { year: 2025, season: "FALL" },
    ];

    let result: GeneratorResult;

    beforeAll(() => {
      result = generateSchedule({
        student: { id: "stu-2", catalogYear: 2024 },
        completedCourses: completed,
        majorRequirements: smallMajor,
        collRequirements: [],
        electivePool: [],
        electiveCreditsNeeded: 0,
        plannedSemesters: remaining,
        availableSections: {},
        preferences: {},
      });
    });

    it("returns success:true", () => {
      expect(result.success).toBe(true);
    });

    it("produces exactly one entry per remaining semester", () => {
      expect(result.plan!.semesters).toHaveLength(2);
    });

    it("does not re-place already-completed courses", () => {
      const allCodes = result.plan!.semesters.flatMap((s) =>
        s.courses.map((c) => c.code)
      );
      expect(allCodes).not.toContain("CS100");
    });

    it("treats completed courses as satisfied prerequisites", () => {
      // CS200 requires CS100 (completed) — it must appear in the plan
      const allCodes = result.plan!.semesters.flatMap((s) =>
        s.courses.map((c) => c.code)
      );
      expect(allCodes).toContain("CS200");
    });

    it("places CS300 in a strictly later semester than CS200 (chain through completed prereq)", () => {
      const sems = result.plan!.semesters;
      expect(semesterOf(sems, "CS200")).toBeLessThan(semesterOf(sems, "CS300"));
    });
  });

  // ── Prerequisite ordering ───────────────────────────────────────────────────

  describe("prerequisite ordering", () => {
    let result: GeneratorResult;

    beforeAll(() => {
      result = generateSchedule(buildInput());
    });

    it("places each prerequisite in a strictly earlier semester than its dependent", () => {
      const sems = result.plan!.semesters;
      expect(semesterOf(sems, "CSCI141")).toBeLessThan(semesterOf(sems, "CSCI142"));
      expect(semesterOf(sems, "MATH112")).toBeLessThan(semesterOf(sems, "MATH211"));
      expect(semesterOf(sems, "MATH112")).toBeLessThan(semesterOf(sems, "MATH214"));
    });

    it("satisfies a two-prerequisite dependency (CSCI315 requires both CSCI301 and CSCI303)", () => {
      const sems = result.plan!.semesters;
      const idx315 = semesterOf(sems, "CSCI315");
      expect(semesterOf(sems, "CSCI301")).toBeLessThan(idx315);
      expect(semesterOf(sems, "CSCI303")).toBeLessThan(idx315);
    });

    it("handles a three-course chain (CSCI141 → CSCI142 → CSCI301) in chronological order", () => {
      const sems = result.plan!.semesters;
      expect(semesterOf(sems, "CSCI141")).toBeLessThan(semesterOf(sems, "CSCI142"));
      expect(semesterOf(sems, "CSCI142")).toBeLessThan(semesterOf(sems, "CSCI301"));
    });

    it("returns PREREQUISITE_CYCLE and success:false for circular dependencies", () => {
      const r = generateSchedule(
        buildInput({
          majorRequirements: [
            makeCourse("CYCLE001", { prerequisiteCodes: ["CYCLE002"] }),
            makeCourse("CYCLE002", { prerequisiteCodes: ["CYCLE001"] }),
          ],
          collRequirements: [],
          electiveCreditsNeeded: 0,
        })
      );
      expect(r.success).toBe(false);
      expect(r.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "PREREQUISITE_CYCLE" }),
        ])
      );
    });
  });

  // ── COLL placement rules ────────────────────────────────────────────────────

  describe("COLL placement rules", () => {
    // Year 1: indices 0–1 (Fall 2024, Spring 2025)
    // Year 2: indices 2–3 (Fall 2025, Spring 2026)
    // "First or second year" → must fall within indices 0–3.
    let result: GeneratorResult;

    beforeAll(() => {
      result = generateSchedule(buildInput());
    });

    it("places COLL 100 within the first two academic years (semesters 1–4)", () => {
      expect(semesterOf(result.plan!.semesters, "COLL100")).toBeLessThan(4);
    });

    it("places COLL 150 within the first two academic years (semesters 1–4)", () => {
      expect(semesterOf(result.plan!.semesters, "FYSE101")).toBeLessThan(4);
    });

    it("places COLL 200, 300, and 400 somewhere valid in the plan (no year constraint)", () => {
      const sems = result.plan!.semesters;
      expect(semesterOf(sems, "ENGL200")).toBeGreaterThanOrEqual(0);
      expect(semesterOf(sems, "HIST300")).toBeGreaterThanOrEqual(0);
      expect(semesterOf(sems, "COLL400")).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Course availability constraints ─────────────────────────────────────────

  describe("course availability constraints", () => {
    let result: GeneratorResult;

    beforeAll(() => {
      result = generateSchedule(buildInput());
    });

    it("places a FALL-only course (CSCI301) in a FALL semester", () => {
      const sems = result.plan!.semesters;
      expect(sems[semesterOf(sems, "CSCI301")].season).toBe("FALL");
    });

    it("places a SPRING-only course (CSCI303) in a SPRING semester", () => {
      const sems = result.plan!.semesters;
      expect(sems[semesterOf(sems, "CSCI303")].season).toBe("SPRING");
    });

    it("returns COURSE_NOT_AVAILABLE when a required course is offered only in a season absent from the plan", () => {
      const r = generateSchedule(
        buildInput({
          majorRequirements: [
            ...CS_MAJOR,
            makeCourse("SUMR101", { seasons: ["SUMMER"] }),
          ],
        })
      );
      expect(r.success).toBe(false);
      expect(r.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "COURSE_NOT_AVAILABLE",
            courseCode: "SUMR101",
          }),
        ])
      );
    });

    it("moves a FALL+SPRING course to the semester where sections exist when preference enforcement requires it", () => {
      // Sections provided only for Spring 2025 — generator must place the course there.
      const course = makeCourse("PHYS101", { seasons: ["FALL", "SPRING"] });
      const springSection = makeSection("phys-spring", "SPRING", 2025, {
        startTime: "10:00am",
        days: "TR",
      });

      const r = generateSchedule({
        student: { id: "stu-3", catalogYear: 2024 },
        completedCourses: [],
        majorRequirements: [course],
        collRequirements: [],
        electivePool: [],
        electiveCreditsNeeded: 0,
        plannedSemesters: [
          { year: 2024, season: "FALL" },
          { year: 2025, season: "SPRING" },
        ],
        availableSections: { PHYS101: [springSection] },
        preferences: { avoidEarlyMorning: true },
      });

      expect(r.success).toBe(true);
      const sems = r.plan!.semesters;
      const placed = sems[semesterOf(sems, "PHYS101")];
      expect(placed.year).toBe(2025);
      expect(placed.season).toBe("SPRING");
    });
  });

  // ── Section preferences ──────────────────────────────────────────────────────

  describe("section preferences", () => {
    /** Minimal single-course, single-semester input for isolated preference tests. */
    function singleCourseInput(
      course: GeneratorCourse,
      sections: SectionOption[],
      prefs: SchedulePreferences
    ): GeneratorInput {
      return {
        student: { id: "stu-prefs", catalogYear: 2024 },
        completedCourses: [],
        majorRequirements: [course],
        collRequirements: [],
        electivePool: [],
        electiveCreditsNeeded: 0,
        plannedSemesters: [{ year: 2024, season: "FALL" }],
        availableSections: { [course.code]: sections },
        preferences: prefs,
      };
    }

    describe("avoidEarlyMorning (sections starting before 9:30am)", () => {
      const course = makeCourse("PREFA001", { seasons: ["FALL"] });

      it("recommends the later section when both an early and a late section exist", () => {
        const early = makeSection("sec-early", "FALL", 2024, {
          startTime: "8:00am",
          endTime: "8:50am",
        });
        const late = makeSection("sec-late", "FALL", 2024, {
          startTime: "10:00am",
          endTime: "10:50am",
        });

        const r = generateSchedule(
          singleCourseInput(course, [early, late], { avoidEarlyMorning: true })
        );
        expect(r.success).toBe(true);
        expect(findCourse(r.plan!.semesters, "PREFA001")?.recommendedSectionId).toBe(
          "sec-late"
        );
      });

      it("treats 9:29am as early (avoid) and 9:30am as acceptable", () => {
        const borderlineEarly = makeSection("sec-929", "FALL", 2024, {
          startTime: "9:29am",
          endTime: "10:20am",
        });
        const acceptable = makeSection("sec-930", "FALL", 2024, {
          startTime: "9:30am",
          endTime: "10:20am",
        });

        const r = generateSchedule(
          singleCourseInput(course, [borderlineEarly, acceptable], {
            avoidEarlyMorning: true,
          })
        );
        expect(r.success).toBe(true);
        expect(findCourse(r.plan!.semesters, "PREFA001")?.recommendedSectionId).toBe(
          "sec-930"
        );
      });

      it("falls back to the early section when it is the only available option", () => {
        const onlyEarly = makeSection("sec-only-early", "FALL", 2024, {
          startTime: "8:00am",
          endTime: "8:50am",
        });

        const r = generateSchedule(
          singleCourseInput(course, [onlyEarly], { avoidEarlyMorning: true })
        );
        expect(r.success).toBe(true);
        expect(findCourse(r.plan!.semesters, "PREFA001")?.recommendedSectionId).toBe(
          "sec-only-early"
        );
      });
    });

    describe("noFridayClasses", () => {
      const course = makeCourse("PREFF001", { seasons: ["FALL"] });

      it("recommends the non-Friday section when one exists", () => {
        const fridaySec = makeSection("sec-mwf", "FALL", 2024, { days: "MWF" });
        const noFridaySec = makeSection("sec-tr", "FALL", 2024, { days: "TR" });

        const r = generateSchedule(
          singleCourseInput(course, [fridaySec, noFridaySec], {
            noFridayClasses: true,
          })
        );
        expect(r.success).toBe(true);
        expect(findCourse(r.plan!.semesters, "PREFF001")?.recommendedSectionId).toBe(
          "sec-tr"
        );
      });

      it("falls back to the Friday section when it is the only option", () => {
        const onlyFriday = makeSection("sec-only-mwf", "FALL", 2024, {
          days: "MWF",
        });

        const r = generateSchedule(
          singleCourseInput(course, [onlyFriday], { noFridayClasses: true })
        );
        expect(r.success).toBe(true);
        expect(findCourse(r.plan!.semesters, "PREFF001")?.recommendedSectionId).toBe(
          "sec-only-mwf"
        );
      });
    });

    it("satisfies both avoidEarlyMorning and noFridayClasses simultaneously when a qualifying section exists", () => {
      const course = makeCourse("PREFB001", { seasons: ["FALL"] });
      const sections = [
        makeSection("bad-both", "FALL", 2024, { days: "MWF", startTime: "8:00am",  endTime: "8:50am"  }),
        makeSection("bad-time", "FALL", 2024, { days: "TR",  startTime: "8:00am",  endTime: "8:50am"  }),
        makeSection("bad-day",  "FALL", 2024, { days: "MWF", startTime: "10:00am", endTime: "10:50am" }),
        makeSection("good",     "FALL", 2024, { days: "TR",  startTime: "10:00am", endTime: "10:50am" }),
      ];

      const r = generateSchedule(
        singleCourseInput(course, sections, {
          avoidEarlyMorning: true,
          noFridayClasses: true,
        })
      );
      expect(r.success).toBe(true);
      expect(findCourse(r.plan!.semesters, "PREFB001")?.recommendedSectionId).toBe(
        "good"
      );
    });

    it("sets recommendedSectionId to null when no sections are provided for a course", () => {
      const r = generateSchedule(buildInput({ availableSections: {} }));
      expect(r.success).toBe(true);
      for (const sem of r.plan!.semesters) {
        for (const course of sem.courses) {
          expect(course.recommendedSectionId).toBeNull();
        }
      }
    });
  });

  // ── Balanced workload ───────────────────────────────────────────────────────

  describe("balanced workload", () => {
    // 8 uniform major courses + 32 uniform electives, all 3 credits, no prereqs.
    // 8 × 3 (major) + 32 × 3 (elective needed) = 24 + 96 = 120 credits across 8 semesters.
    // Optimal: exactly 15 credits per semester. Spread should be ≤ 3.
    const uniformMajor: GeneratorCourse[] = Array.from({ length: 8 }, (_, i) =>
      makeCourse(`UNIF${String(i + 1).padStart(3, "0")}`, { credits: 3 })
    );
    const uniformPool: GeneratorCourse[] = Array.from({ length: 40 }, (_, i) =>
      makeCourse(`UPOOL${String(i + 1).padStart(3, "0")}`, { credits: 3 })
    );

    let result: GeneratorResult;

    beforeAll(() => {
      result = generateSchedule(
        buildInput({
          majorRequirements: uniformMajor,
          collRequirements: [],
          electivePool: uniformPool,
          electiveCreditsNeeded: 96,
        })
      );
    });

    it("keeps per-semester credit counts within 3 credits of each other for uniform-credit courses", () => {
      expect(result.success).toBe(true);
      const credits = result.plan!.semesters.map((s) => s.totalCredits);
      expect(Math.max(...credits) - Math.min(...credits)).toBeLessThanOrEqual(3);
    });

    it("does not place 18 credits in one semester while another has 12 when 15 is achievable", () => {
      const credits = result.plan!.semesters.map((s) => s.totalCredits);
      const hasMax = credits.some((c) => c === 18);
      const hasMin = credits.some((c) => c === 12);
      // Both extremes appearing together signals an unbalanced plan
      expect(hasMax && hasMin).toBe(false);
    });
  });

  // ── Elective selection ──────────────────────────────────────────────────────

  describe("elective selection", () => {
    let result: GeneratorResult;

    beforeAll(() => {
      result = generateSchedule(buildInput());
    });

    it("picks electives from the pool to fill remaining credit capacity", () => {
      const allCodes = result.plan!.semesters.flatMap((s) =>
        s.courses.map((c) => c.code)
      );
      const electiveCodes = new Set(ELECTIVE_POOL.map((e) => e.code));
      const placed = allCodes.filter((code) => electiveCodes.has(code));
      expect(placed.length).toBeGreaterThan(0);
    });

    it("does not overshoot the credit target by more than one course's worth", () => {
      // With 3-credit electives and target 79, max overage = 2 → total ≤ 123
      expect(result.plan!.totalCredits).toBeLessThanOrEqual(123);
    });

    it("only places courses from the provided major, COLL, and elective pool", () => {
      const knownCodes = new Set([
        ...CS_MAJOR.map((c) => c.code),
        ...COLL_REQS.map((r) => r.course.code),
        ...ELECTIVE_POOL.map((e) => e.code),
      ]);
      const allCodes = result.plan!.semesters.flatMap((s) =>
        s.courses.map((c) => c.code)
      );
      for (const code of allCodes) {
        expect(knownCodes.has(code)).toBe(true);
      }
    });
  });

  // ── Error cases ─────────────────────────────────────────────────────────────

  describe("error cases", () => {
    it("returns CANNOT_FIT_COURSES when required credits exceed the 8-semester maximum (144)", () => {
      // 50 × 3 = 150 required credits; 8 × 18 = 144 maximum possible
      const tooMany: GeneratorCourse[] = Array.from({ length: 50 }, (_, i) =>
        makeCourse(`OVER${String(i + 1).padStart(3, "0")}`)
      );

      const r = generateSchedule(
        buildInput({
          majorRequirements: tooMany,
          collRequirements: [],
          electiveCreditsNeeded: 0,
        })
      );
      expect(r.success).toBe(false);
      expect(r.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "CANNOT_FIT_COURSES" }),
        ])
      );
    });

    it("returns errors as a non-empty array (never undefined) on any failure", () => {
      const r = generateSchedule(
        buildInput({
          majorRequirements: [
            makeCourse("ERR001", { prerequisiteCodes: ["ERR002"] }),
            makeCourse("ERR002", { prerequisiteCodes: ["ERR001"] }),
          ],
          collRequirements: [],
          electiveCreditsNeeded: 0,
        })
      );
      expect(r.success).toBe(false);
      expect(Array.isArray(r.errors)).toBe(true);
      expect(r.errors!.length).toBeGreaterThan(0);
    });
  });
});
