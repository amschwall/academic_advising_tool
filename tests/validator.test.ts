// file: tests/validator.test.ts

/**
 * Phase 6 — Requirement Validation Engine
 *
 * All tests use pure in-memory data objects; no database is required.
 *
 * Conventions:
 *  - collAttribute values use the normalised "COLL 100" format (as stored in the DB).
 *  - Season ordering within a year: SPRING < SUMMER < FALL < WINTER.
 *  - Prerequisite "satisfied" means completed with a passing grade OR, for future
 *    planning, placed in a strictly earlier semester.
 *  - Per-semester credit limits: min = 12, max = 18 (W&M defaults).
 *  - Graduation credit minimum: 120.
 */

import {
  checkCollRequirements,
  checkMajorRequirements,
  checkPrerequisites,
  checkSemesterCredits,
  checkTimeConflicts,
  validateCourseAddition,
  validateSchedule,
  validateGraduationProgress,
} from "@/lib/validator/validator";

import type {
  ValidationError,
  ValidationResult,
  SectionTimeInfo,
  GraduationProgress,
  CourseAdditionInput,
  FullScheduleInput,
  GraduationProgressInput,
  ValidatorScheduleItem,
} from "@/lib/validator/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type Season = "FALL" | "SPRING" | "SUMMER" | "WINTER";

function item(
  courseCode: string,
  year: number,
  season: Season,
  completed: boolean,
  credits = 3,
  grade: string | null = null,
  sectionId: string | null = null
): ValidatorScheduleItem {
  return { courseCode, year, season, completed, credits, grade, sectionId };
}

function section(
  id: string,
  days: string | null,
  startTime: string | null,
  endTime: string | null,
  year = 2025,
  season: Season = "FALL"
): SectionTimeInfo {
  return { id, days, startTime, endTime, year, season };
}

function errorTypes(result: ValidationResult): string[] {
  return result.errors.map((e) => e.type);
}

// ---------------------------------------------------------------------------
// checkCollRequirements()
// ---------------------------------------------------------------------------

describe("checkCollRequirements()", () => {
  const ALL_COLL_LEVELS = ["COLL 100", "COLL 150", "COLL 200", "COLL 300", "COLL 400"];

  it("returns no errors when all COLL levels are satisfied", () => {
    const completed = [
      { code: "COLL100A", collAttribute: "COLL 100" },
      { code: "COLL150A", collAttribute: "COLL 150" },
      { code: "HIST200",  collAttribute: "COLL 200" },
      { code: "ENGL300",  collAttribute: "COLL 300" },
      { code: "CSCI400",  collAttribute: "COLL 400" },
    ];
    const errors = checkCollRequirements(completed, ALL_COLL_LEVELS);
    expect(errors).toHaveLength(0);
  });

  it("returns an error for each missing COLL level", () => {
    const completed = [
      { code: "COLL100A", collAttribute: "COLL 100" },
    ];
    const errors = checkCollRequirements(completed, ALL_COLL_LEVELS);
    const missing = errors.map((e) => e.message);
    expect(errors).toHaveLength(4);
    expect(errors.every((e) => e.type === "MISSING_COLL")).toBe(true);
    expect(missing.some((m) => m.includes("COLL 150"))).toBe(true);
    expect(missing.some((m) => m.includes("COLL 200"))).toBe(true);
    expect(missing.some((m) => m.includes("COLL 300"))).toBe(true);
    expect(missing.some((m) => m.includes("COLL 400"))).toBe(true);
  });

  it("returns a single error for one missing COLL level", () => {
    const completed = [
      { code: "COLL100A", collAttribute: "COLL 100" },
      { code: "COLL150A", collAttribute: "COLL 150" },
      { code: "HIST200",  collAttribute: "COLL 200" },
      { code: "ENGL300",  collAttribute: "COLL 300" },
      // COLL 400 missing
    ];
    const errors = checkCollRequirements(completed, ALL_COLL_LEVELS);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe("MISSING_COLL");
    expect(errors[0].message).toContain("COLL 400");
  });

  it("ignores courses with null collAttribute when checking COLL", () => {
    const completed = [
      { code: "CSCI301", collAttribute: null },
      { code: "MATH302", collAttribute: null },
    ];
    const errors = checkCollRequirements(completed, ["COLL 100"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe("MISSING_COLL");
  });

  it("returns no errors when no COLL levels are required", () => {
    const completed = [{ code: "CSCI301", collAttribute: null }];
    const errors = checkCollRequirements(completed, []);
    expect(errors).toHaveLength(0);
  });

  it("returns all levels missing when completed list is empty", () => {
    const errors = checkCollRequirements([], ALL_COLL_LEVELS);
    expect(errors).toHaveLength(ALL_COLL_LEVELS.length);
  });

  it("does not double-count if two courses satisfy the same level", () => {
    const completed = [
      { code: "COLL100A", collAttribute: "COLL 100" },
      { code: "COLL100B", collAttribute: "COLL 100" }, // duplicate
    ];
    const errors = checkCollRequirements(completed, ["COLL 100"]);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkMajorRequirements()
// ---------------------------------------------------------------------------

describe("checkMajorRequirements()", () => {
  const CS_REQUIRED = ["CSCI141", "CSCI241", "CSCI301", "CSCI303", "CSCI426"];

  it("returns no errors when all required courses are completed", () => {
    const completed = new Set(CS_REQUIRED);
    expect(checkMajorRequirements(completed, CS_REQUIRED)).toHaveLength(0);
  });

  it("returns an error for each missing required course", () => {
    const completed = new Set(["CSCI141", "CSCI241"]);
    const errors = checkMajorRequirements(completed, CS_REQUIRED);
    expect(errors).toHaveLength(3);
    expect(errors.every((e) => e.type === "MISSING_MAJOR_COURSE")).toBe(true);
    const missing = errors.map((e) => e.courseCode);
    expect(missing).toContain("CSCI301");
    expect(missing).toContain("CSCI303");
    expect(missing).toContain("CSCI426");
  });

  it("each error carries the missing course code", () => {
    const errors = checkMajorRequirements(new Set(), ["CSCI141"]);
    expect(errors[0].courseCode).toBe("CSCI141");
  });

  it("returns no errors when required list is empty", () => {
    const errors = checkMajorRequirements(new Set(["CSCI141"]), []);
    expect(errors).toHaveLength(0);
  });

  it("does not count a course in the completed set that is not in requirements as satisfied", () => {
    // CSCI999 is completed but not required — requirements still not met
    const completed = new Set(["CSCI999"]);
    const errors = checkMajorRequirements(completed, ["CSCI141"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].courseCode).toBe("CSCI141");
  });
});

// ---------------------------------------------------------------------------
// checkPrerequisites()
// ---------------------------------------------------------------------------

describe("checkPrerequisites()", () => {
  it("returns no error when course has no prerequisites", () => {
    const errors = checkPrerequisites("CSCI141", [], new Set());
    expect(errors).toHaveLength(0);
  });

  it("returns no error when all prerequisites are satisfied", () => {
    const satisfied = new Set(["CSCI141", "MATH111"]);
    const errors = checkPrerequisites("CSCI241", ["CSCI141", "MATH111"], satisfied);
    expect(errors).toHaveLength(0);
  });

  it("returns an error for each unsatisfied prerequisite", () => {
    const satisfied = new Set(["CSCI141"]);
    const errors = checkPrerequisites("CSCI301", ["CSCI141", "CSCI241"], satisfied);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe("PREREQUISITE_NOT_MET");
    expect(errors[0].courseCode).toBe("CSCI241");
  });

  it("returns errors for all unsatisfied prerequisites when none are met", () => {
    const errors = checkPrerequisites("CSCI426", ["CSCI301", "CSCI303"], new Set());
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.type === "PREREQUISITE_NOT_MET")).toBe(true);
  });

  it("includes the target course in each error message", () => {
    const errors = checkPrerequisites("CSCI301", ["CSCI241"], new Set());
    expect(errors[0].message).toContain("CSCI301");
  });

  it("includes the missing prerequisite code in the error message", () => {
    const errors = checkPrerequisites("CSCI301", ["CSCI241"], new Set());
    expect(errors[0].message).toContain("CSCI241");
  });
});

// ---------------------------------------------------------------------------
// checkSemesterCredits()
// ---------------------------------------------------------------------------

describe("checkSemesterCredits()", () => {
  const SEM = { year: 2025, season: "FALL" as Season };

  it("returns no errors for exactly 18 credits (at the maximum)", () => {
    expect(checkSemesterCredits(18, SEM)).toHaveLength(0);
  });

  it("returns no errors for exactly 12 credits (at the minimum)", () => {
    expect(checkSemesterCredits(12, SEM)).toHaveLength(0);
  });

  it("returns no errors for 15 credits (between min and max)", () => {
    expect(checkSemesterCredits(15, SEM)).toHaveLength(0);
  });

  it("returns CREDIT_LIMIT_EXCEEDED error for 19 credits", () => {
    const errors = checkSemesterCredits(19, SEM);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe("CREDIT_LIMIT_EXCEEDED");
    expect(errors[0].semester).toEqual(SEM);
  });

  it("returns BELOW_MINIMUM_CREDITS error for 11 credits", () => {
    const errors = checkSemesterCredits(11, SEM);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe("BELOW_MINIMUM_CREDITS");
    expect(errors[0].semester).toEqual(SEM);
  });

  it("returns BELOW_MINIMUM_CREDITS error for 0 credits", () => {
    const errors = checkSemesterCredits(0, SEM);
    expect(errors[0].type).toBe("BELOW_MINIMUM_CREDITS");
  });

  it("returns CREDIT_LIMIT_EXCEEDED for very high credit load", () => {
    const errors = checkSemesterCredits(25, SEM);
    expect(errors.some((e) => e.type === "CREDIT_LIMIT_EXCEEDED")).toBe(true);
  });

  it("error message includes the semester year and season", () => {
    const errors = checkSemesterCredits(19, SEM);
    expect(errors[0].message).toContain("2025");
    expect(errors[0].message).toContain("FALL");
  });
});

// ---------------------------------------------------------------------------
// checkTimeConflicts()
// ---------------------------------------------------------------------------

describe("checkTimeConflicts()", () => {
  it("returns no errors for a single section", () => {
    const sections = [section("s1", "MWF", "10:00am", "10:50am")];
    expect(checkTimeConflicts(sections)).toHaveLength(0);
  });

  it("returns no errors when two sections meet on different days", () => {
    const sections = [
      section("s1", "MWF", "10:00am", "10:50am"),
      section("s2", "TR",  "10:00am", "10:50am"),
    ];
    expect(checkTimeConflicts(sections)).toHaveLength(0);
  });

  it("returns no errors for back-to-back sections on the same days", () => {
    const sections = [
      section("s1", "MWF", "10:00am", "10:50am"),
      section("s2", "MWF", "11:00am", "11:50am"),
    ];
    expect(checkTimeConflicts(sections)).toHaveLength(0);
  });

  it("detects a direct overlap on the same days", () => {
    const sections = [
      section("s1", "MWF", "10:00am", "10:50am"),
      section("s2", "MWF", "10:00am", "10:50am"),
    ];
    const errors = checkTimeConflicts(sections);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].type).toBe("TIME_CONFLICT");
  });

  it("detects a partial overlap on the same days", () => {
    const sections = [
      section("s1", "TR", "11:00am", "12:20pm"),
      section("s2", "TR", "12:00pm", "1:20pm"),
    ];
    const errors = checkTimeConflicts(sections);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].type).toBe("TIME_CONFLICT");
  });

  it("detects overlap when one section is contained within another", () => {
    const sections = [
      section("s1", "MWF", "9:00am", "11:00am"),
      section("s2", "MWF", "9:30am", "10:30am"),
    ];
    const errors = checkTimeConflicts(sections);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("detects overlap on shared days even when other days differ", () => {
    // Both meet on Monday — overlap even though one is MWF and other is MTR
    const sections = [
      section("s1", "MWF", "10:00am", "10:50am"),
      section("s2", "MTR", "10:00am", "10:50am"),
    ];
    const errors = checkTimeConflicts(sections);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("skips TBA sections (null days) — no false positive conflict", () => {
    const sections = [
      section("s1", "MWF", "10:00am", "10:50am"),
      section("s2", null, null, null),
    ];
    expect(checkTimeConflicts(sections)).toHaveLength(0);
  });

  it("skips sections with null times — no false positive conflict", () => {
    const sections = [
      section("s1", "MWF", null, null),
      section("s2", "MWF", null, null),
    ];
    expect(checkTimeConflicts(sections)).toHaveLength(0);
  });

  it("error references the two conflicting section ids", () => {
    const sections = [
      section("sec-A", "MWF", "10:00am", "10:50am"),
      section("sec-B", "MWF", "10:00am", "10:50am"),
    ];
    const errors = checkTimeConflicts(sections);
    const msg = errors[0].message;
    expect(msg).toContain("sec-A");
    expect(msg).toContain("sec-B");
  });

  it("returns no errors for an empty sections list", () => {
    expect(checkTimeConflicts([])).toHaveLength(0);
  });

  it("handles pm/am boundary correctly — 12:00pm is noon, not midnight", () => {
    // 11:50am–12:00pm and 12:00pm–12:50pm are back-to-back, not overlapping
    const sections = [
      section("s1", "TR", "11:00am", "12:00pm"),
      section("s2", "TR", "12:00pm", "12:50pm"),
    ];
    expect(checkTimeConflicts(sections)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateCourseAddition()
// ---------------------------------------------------------------------------

describe("validateCourseAddition()", () => {
  it("returns valid when prerequisites are met and credits are within limits", () => {
    const input: CourseAdditionInput = {
      course: { code: "CSCI301", credits: 3, prerequisiteCodes: ["CSCI241"] },
      targetSemester: { year: 2025, season: "FALL" },
      currentSemesterCredits: 12,
      satisfiedPrereqs: new Set(["CSCI241"]),
    };
    const result = validateCourseAddition(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when a prerequisite is not satisfied", () => {
    const input: CourseAdditionInput = {
      course: { code: "CSCI301", credits: 3, prerequisiteCodes: ["CSCI241"] },
      targetSemester: { year: 2025, season: "FALL" },
      currentSemesterCredits: 12,
      satisfiedPrereqs: new Set(), // CSCI241 not satisfied
    };
    const result = validateCourseAddition(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "PREREQUISITE_NOT_MET")).toBe(true);
  });

  it("fails when adding the course would exceed 18 credits", () => {
    const input: CourseAdditionInput = {
      course: { code: "CSCI301", credits: 3, prerequisiteCodes: [] },
      targetSemester: { year: 2025, season: "FALL" },
      currentSemesterCredits: 17, // adding 3 → 20, exceeds 18
      satisfiedPrereqs: new Set(),
    };
    const result = validateCourseAddition(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "CREDIT_LIMIT_EXCEEDED")).toBe(true);
  });

  it("passes when adding course brings semester exactly to 18 credits", () => {
    const input: CourseAdditionInput = {
      course: { code: "CSCI301", credits: 3, prerequisiteCodes: [] },
      targetSemester: { year: 2025, season: "FALL" },
      currentSemesterCredits: 15, // adding 3 → 18, exactly at limit
      satisfiedPrereqs: new Set(),
    };
    const result = validateCourseAddition(input);
    expect(result.errors.some((e) => e.type === "CREDIT_LIMIT_EXCEEDED")).toBe(false);
  });

  it("detects time conflict when a new section overlaps existing sections", () => {
    const input: CourseAdditionInput = {
      course: { code: "HIST200", credits: 3, prerequisiteCodes: [] },
      targetSemester: { year: 2025, season: "FALL" },
      currentSemesterCredits: 12,
      satisfiedPrereqs: new Set(),
      currentSections: [section("existing", "MWF", "10:00am", "10:50am")],
      newSection: section("new-sec", "MWF", "10:00am", "10:50am"),
    };
    const result = validateCourseAddition(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "TIME_CONFLICT")).toBe(true);
  });

  it("returns multiple errors when multiple constraints are violated", () => {
    const input: CourseAdditionInput = {
      course: { code: "CSCI426", credits: 3, prerequisiteCodes: ["CSCI301"] },
      targetSemester: { year: 2025, season: "FALL" },
      currentSemesterCredits: 17, // will exceed 18 after addition
      satisfiedPrereqs: new Set(), // prereq not satisfied
    };
    const result = validateCourseAddition(input);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(errorTypes(result)).toContain("PREREQUISITE_NOT_MET");
    expect(errorTypes(result)).toContain("CREDIT_LIMIT_EXCEEDED");
  });
});

// ---------------------------------------------------------------------------
// validateSchedule()
// ---------------------------------------------------------------------------

describe("validateSchedule()", () => {
  // ── prerequisite enforcement across semesters ────────────────────────────

  describe("prerequisite enforcement", () => {
    it("passes when a prerequisite is planned in a strictly earlier semester", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [
          item("CSCI141", 2023, "FALL",   false, 3), // prereq planned earlier
          item("CSCI241", 2024, "SPRING", false, 3), // course requiring CSCI141
        ],
        courses: {
          CSCI141: { code: "CSCI141", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI241: { code: "CSCI241", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: ["CSCI141"] },
        },
        collRequirements: [],
        majorRequirements: [],
      };
      const result = validateSchedule(input);
      expect(result.errors.filter((e) => e.type === "PREREQUISITE_NOT_MET")).toHaveLength(0);
    });

    it("fails when a prerequisite is scheduled in the SAME semester", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [
          item("CSCI141", 2024, "FALL", false, 3), // same semester as CSCI241
          item("CSCI241", 2024, "FALL", false, 3), // requires CSCI141
        ],
        courses: {
          CSCI141: { code: "CSCI141", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI241: { code: "CSCI241", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: ["CSCI141"] },
        },
        collRequirements: [],
        majorRequirements: [],
      };
      const result = validateSchedule(input);
      expect(result.errors.some((e) => e.type === "PREREQUISITE_NOT_MET")).toBe(true);
    });

    it("fails when a prerequisite appears in a LATER semester than the course", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [
          item("CSCI241", 2023, "FALL",   false, 3), // course before its prereq
          item("CSCI141", 2024, "SPRING", false, 3), // prereq in later semester
        ],
        courses: {
          CSCI141: { code: "CSCI141", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI241: { code: "CSCI241", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: ["CSCI141"] },
        },
        collRequirements: [],
        majorRequirements: [],
      };
      const result = validateSchedule(input);
      expect(result.errors.some((e) => e.type === "PREREQUISITE_NOT_MET")).toBe(true);
    });
  });

  // ── COLL requirement checking ─────────────────────────────────────────────

  describe("COLL requirement checking", () => {
    it("passes when all required COLL levels are in the schedule", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [
          item("COLL100A", 2023, "FALL",   false, 1),
          item("COLL150A", 2023, "FALL",   false, 3),
          item("HIST200",  2024, "SPRING", false, 3),
          item("ENGL300",  2024, "FALL",   false, 3),
          item("CSCI400",  2026, "SPRING", false, 3),
        ],
        courses: {
          COLL100A: { code: "COLL100A", credits: 1, collAttribute: "COLL 100", alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          COLL150A: { code: "COLL150A", credits: 3, collAttribute: "COLL 150", alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          HIST200:  { code: "HIST200",  credits: 3, collAttribute: "COLL 200", alv: true,  csi: false, nqr: false, prerequisiteCodes: [] },
          ENGL300:  { code: "ENGL300",  credits: 3, collAttribute: "COLL 300", alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI400:  { code: "CSCI400",  credits: 3, collAttribute: "COLL 400", alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        },
        collRequirements: ["COLL 100", "COLL 150", "COLL 200", "COLL 300", "COLL 400"],
        majorRequirements: [],
      };
      const result = validateSchedule(input);
      expect(result.errors.filter((e) => e.type === "MISSING_COLL")).toHaveLength(0);
    });

    it("reports a MISSING_COLL error when a COLL level is absent from the schedule", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [item("CSCI301", 2024, "FALL", false, 3)],
        courses: {
          CSCI301: { code: "CSCI301", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        },
        collRequirements: ["COLL 100"],
        majorRequirements: [],
      };
      const result = validateSchedule(input);
      expect(result.errors.some((e) => e.type === "MISSING_COLL")).toBe(true);
    });
  });

  // ── major requirement validation ──────────────────────────────────────────

  describe("major requirement validation", () => {
    it("passes when all required major courses appear in the schedule", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [
          item("CSCI141", 2023, "FALL",   false, 3),
          item("CSCI241", 2024, "SPRING", false, 3),
          item("CSCI301", 2024, "FALL",   false, 3),
        ],
        courses: {
          CSCI141: { code: "CSCI141", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI241: { code: "CSCI241", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: ["CSCI141"] },
          CSCI301: { code: "CSCI301", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: ["CSCI241"] },
        },
        collRequirements: [],
        majorRequirements: ["CSCI141", "CSCI241", "CSCI301"],
      };
      const result = validateSchedule(input);
      expect(result.errors.filter((e) => e.type === "MISSING_MAJOR_COURSE")).toHaveLength(0);
    });

    it("reports MISSING_MAJOR_COURSE errors for absent required courses", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [item("CSCI141", 2023, "FALL", false, 3)],
        courses: {
          CSCI141: { code: "CSCI141", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        },
        collRequirements: [],
        majorRequirements: ["CSCI141", "CSCI241", "CSCI301"],
      };
      const result = validateSchedule(input);
      const missing = result.errors.filter((e) => e.type === "MISSING_MAJOR_COURSE");
      expect(missing).toHaveLength(2);
      expect(missing.map((e) => e.courseCode)).toContain("CSCI241");
      expect(missing.map((e) => e.courseCode)).toContain("CSCI301");
    });
  });

  // ── semester credit limits ────────────────────────────────────────────────

  describe("semester credit limits", () => {
    it("passes when every semester is within 12–18 credits", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [
          item("CSCI141", 2023, "FALL", false, 3),
          item("CSCI151", 2023, "FALL", false, 3),
          item("CSCI161", 2023, "FALL", false, 3),
          item("CSCI171", 2023, "FALL", false, 3),
          item("CSCI181", 2023, "FALL", false, 3), // 15 credits total
        ],
        courses: {
          CSCI141: { code: "CSCI141", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI151: { code: "CSCI151", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI161: { code: "CSCI161", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI171: { code: "CSCI171", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI181: { code: "CSCI181", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        },
        collRequirements: [],
        majorRequirements: [],
      };
      const result = validateSchedule(input);
      expect(result.errors.filter((e) => e.type === "CREDIT_LIMIT_EXCEEDED")).toHaveLength(0);
      expect(result.errors.filter((e) => e.type === "BELOW_MINIMUM_CREDITS")).toHaveLength(0);
    });

    it("reports CREDIT_LIMIT_EXCEEDED when a semester exceeds 18 credits", () => {
      // 7 × 3-credit courses = 21 credits in one semester
      const codes = ["CA", "CB", "CC", "CD", "CE", "CF", "CG"];
      const items = codes.map((c) => item(c, 2024, "FALL", false, 3));
      const courses = Object.fromEntries(
        codes.map((c) => [c, { code: c, credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] }])
      );
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items,
        courses,
        collRequirements: [],
        majorRequirements: [],
      };
      const result = validateSchedule(input);
      expect(result.errors.some((e) => e.type === "CREDIT_LIMIT_EXCEEDED")).toBe(true);
    });

    it("reports BELOW_MINIMUM_CREDITS when a semester has fewer than 12 credits", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [item("CSCI141", 2024, "FALL", false, 3)], // only 3 credits
        courses: {
          CSCI141: { code: "CSCI141", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        },
        collRequirements: [],
        majorRequirements: [],
      };
      const result = validateSchedule(input);
      expect(result.errors.some((e) => e.type === "BELOW_MINIMUM_CREDITS")).toBe(true);
    });
  });

  // ── time conflict detection ───────────────────────────────────────────────

  describe("time conflict detection", () => {
    it("reports TIME_CONFLICT when two sections in the same semester overlap", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [
          item("CSCI301", 2024, "FALL", false, 3, null, "sec-1"),
          item("HIST200",  2024, "FALL", false, 3, null, "sec-2"),
          item("MATH301", 2024, "FALL", false, 3, null, null), // no section — pad credits
          item("ENGL200", 2024, "FALL", false, 3, null, null),
          item("PHIL101", 2024, "FALL", false, 3, null, null),
        ],
        courses: {
          CSCI301: { code: "CSCI301", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          HIST200:  { code: "HIST200",  credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          MATH301: { code: "MATH301", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          ENGL200: { code: "ENGL200", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          PHIL101: { code: "PHIL101", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        },
        collRequirements: [],
        majorRequirements: [],
        sections: {
          "sec-1": section("sec-1", "MWF", "10:00am", "10:50am", 2024, "FALL"),
          "sec-2": section("sec-2", "MWF", "10:00am", "10:50am", 2024, "FALL"),
        },
      };
      const result = validateSchedule(input);
      expect(result.errors.some((e) => e.type === "TIME_CONFLICT")).toBe(true);
    });

    it("does not flag sections in different semesters as conflicting", () => {
      const input: FullScheduleInput = {
        student: { id: "s1", catalogYear: 2023 },
        items: [
          // Fall 2024
          item("CSCI301", 2024, "FALL",   false, 3, null, "sec-1"),
          item("HIST200",  2024, "FALL",   false, 3, null, null),
          item("MATH301", 2024, "FALL",   false, 3, null, null),
          item("ENGL200", 2024, "FALL",   false, 3, null, null),
          item("PHIL101", 2024, "FALL",   false, 3, null, null),
          // Spring 2025 — same time slot, different semester (no conflict)
          item("CSCI303", 2025, "SPRING", false, 3, null, "sec-2"),
          item("BIOL101", 2025, "SPRING", false, 3, null, null),
          item("CHEM101", 2025, "SPRING", false, 3, null, null),
          item("PHYS101", 2025, "SPRING", false, 3, null, null),
          item("PSYC101", 2025, "SPRING", false, 3, null, null),
        ],
        courses: {
          CSCI301: { code: "CSCI301", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          HIST200:  { code: "HIST200",  credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          MATH301: { code: "MATH301", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          ENGL200: { code: "ENGL200", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          PHIL101: { code: "PHIL101", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CSCI303: { code: "CSCI303", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          BIOL101: { code: "BIOL101", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          CHEM101: { code: "CHEM101", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          PHYS101: { code: "PHYS101", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
          PSYC101: { code: "PSYC101", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        },
        collRequirements: [],
        majorRequirements: [],
        sections: {
          "sec-1": section("sec-1", "MWF", "10:00am", "10:50am", 2024, "FALL"),
          "sec-2": section("sec-2", "MWF", "10:00am", "10:50am", 2025, "SPRING"),
        },
      };
      const result = validateSchedule(input);
      expect(result.errors.filter((e) => e.type === "TIME_CONFLICT")).toHaveLength(0);
    });
  });

  // ── catalog-year-specific validation ─────────────────────────────────────

  describe("catalog-year-specific validation", () => {
    it("uses requirements from the student's catalog year, not another year", () => {
      // Student has catalogYear 2023. The COLL requirements array should be
      // populated by the caller with 2023 requirements only.
      // validateSchedule applies them as given — catalog scoping is the caller's job.
      // This test verifies that two students with different requirement sets
      // produce different results for the same schedule.

      const sharedItems = [item("CSCI141", 2023, "FALL", false, 3)];
      const sharedCourses = {
        CSCI141: { code: "CSCI141", credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
      };

      // 2023: no COLL requirements
      const result2023 = validateSchedule({
        student: { id: "s1", catalogYear: 2023 },
        items: sharedItems,
        courses: sharedCourses,
        collRequirements: [],         // 2023: no COLL requirement
        majorRequirements: [],
      });

      // 2024: requires COLL 100
      const result2024 = validateSchedule({
        student: { id: "s2", catalogYear: 2024 },
        items: sharedItems,
        courses: sharedCourses,
        collRequirements: ["COLL 100"], // 2024: COLL 100 required
        majorRequirements: [],
      });

      expect(result2023.errors.filter((e) => e.type === "MISSING_COLL")).toHaveLength(0);
      expect(result2024.errors.filter((e) => e.type === "MISSING_COLL")).toHaveLength(1);
    });
  });

  // ── valid full schedule ───────────────────────────────────────────────────

  it("returns valid:true for a clean 2-semester plan that satisfies all rules", () => {
    const input: FullScheduleInput = {
      student: { id: "s1", catalogYear: 2023 },
      items: [
        // Fall 2023: 15 credits, no prereqs
        item("CSCI141",  2023, "FALL",   false, 3),
        item("COLL100A", 2023, "FALL",   false, 1),
        item("HIST101",  2023, "FALL",   false, 3),
        item("MATH111",  2023, "FALL",   false, 4),
        item("ENGL101",  2023, "FALL",   false, 3),
        item("COLL150A", 2023, "FALL",   false, 3),
        // Spring 2024: 15 credits, CSCI241 requires CSCI141
        item("CSCI241",  2024, "SPRING", false, 3),
        item("HIST201",  2024, "SPRING", false, 3),
        item("MATH112",  2024, "SPRING", false, 4),
        item("ENGL201",  2024, "SPRING", false, 3),
        item("COLL200A", 2024, "SPRING", false, 3),
      ],
      courses: {
        CSCI141:  { code: "CSCI141",  credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        COLL100A: { code: "COLL100A", credits: 1, collAttribute: "COLL 100",alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        HIST101:  { code: "HIST101",  credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        MATH111:  { code: "MATH111",  credits: 4, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        ENGL101:  { code: "ENGL101",  credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        COLL150A: { code: "COLL150A", credits: 3, collAttribute: "COLL 150",alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        CSCI241:  { code: "CSCI241",  credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: ["CSCI141"] },
        HIST201:  { code: "HIST201",  credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        MATH112:  { code: "MATH112",  credits: 4, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        ENGL201:  { code: "ENGL201",  credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
        COLL200A: { code: "COLL200A", credits: 3, collAttribute: "COLL 200",alv: true,  csi: false, nqr: false, prerequisiteCodes: [] },
      },
      collRequirements: ["COLL 100", "COLL 150", "COLL 200"],
      majorRequirements: ["CSCI141", "CSCI241"],
    };
    const result = validateSchedule(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateGraduationProgress()
// ---------------------------------------------------------------------------

describe("validateGraduationProgress()", () => {
  const COURSES: GraduationProgressInput["courses"] = {
    CSCI141: { code: "CSCI141", credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
    CSCI241: { code: "CSCI241", credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
    CSCI301: { code: "CSCI301", credits: 3, collAttribute: null,      alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
    COLL100A: { code: "COLL100A", credits: 1, collAttribute: "COLL 100", alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
    HIST200:  { code: "HIST200",  credits: 3, collAttribute: "COLL 200", alv: true,  csi: false, nqr: false, prerequisiteCodes: [] },
  };

  const REQUIREMENTS: GraduationProgressInput["requirements"] = [
    { name: "COLL 100", type: "COLL", collLevel: "COLL 100", catalogYear: 2023 },
    { name: "COLL 200", type: "COLL", collLevel: "COLL 200", catalogYear: 2023 },
    { name: "CS Core",  type: "MAJOR", requiredCourseCodes: ["CSCI141", "CSCI241", "CSCI301"], catalogYear: 2023 },
  ];

  it("counts only completed schedule items toward credit total", () => {
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items: [
        item("CSCI141", 2023, "FALL",   true,  3, "B+"),  // completed
        item("CSCI241", 2024, "SPRING", true,  3, "A"),   // completed
        item("CSCI301", 2024, "FALL",   false, 3),         // planned, not completed
      ],
      requirements: REQUIREMENTS,
      courses: COURSES,
    };
    const progress: GraduationProgress = validateGraduationProgress(input);
    expect(progress.completedCredits).toBe(6); // only the two completed
  });

  it("reports the required graduation credit total as 120", () => {
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items: [],
      requirements: [],
      courses: {},
    };
    expect(validateGraduationProgress(input).requiredCredits).toBe(120);
  });

  it("calculates percentComplete correctly", () => {
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items: [item("CSCI141", 2023, "FALL", true, 60, "A")], // 60 credits completed
      requirements: [],
      courses: {
        CSCI141: { code: "CSCI141", credits: 60, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] },
      },
    };
    const progress = validateGraduationProgress(input);
    expect(progress.percentComplete).toBeCloseTo(50);
  });

  it("marks a COLL requirement as met when the student completed a matching course", () => {
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items: [item("COLL100A", 2023, "FALL", true, 1, "A")],
      requirements: REQUIREMENTS,
      courses: COURSES,
    };
    const progress = validateGraduationProgress(input);
    const coll100 = progress.remainingRequirements.find((r) => r.name === "COLL 100");
    expect(coll100?.met).toBe(true);
  });

  it("marks a COLL requirement as not met when no matching course is completed", () => {
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items: [],
      requirements: REQUIREMENTS,
      courses: COURSES,
    };
    const progress = validateGraduationProgress(input);
    const coll100 = progress.remainingRequirements.find((r) => r.name === "COLL 100");
    expect(coll100?.met).toBe(false);
  });

  it("marks a MAJOR requirement as met when ALL required courses are completed", () => {
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items: [
        item("CSCI141", 2023, "FALL",   true, 3, "A"),
        item("CSCI241", 2024, "SPRING", true, 3, "B"),
        item("CSCI301", 2024, "FALL",   true, 3, "A-"),
      ],
      requirements: REQUIREMENTS,
      courses: COURSES,
    };
    const progress = validateGraduationProgress(input);
    const csCore = progress.remainingRequirements.find((r) => r.name === "CS Core");
    expect(csCore?.met).toBe(true);
  });

  it("marks a MAJOR requirement as not met when some required courses are missing", () => {
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items: [item("CSCI141", 2023, "FALL", true, 3, "B")],
      requirements: REQUIREMENTS,
      courses: COURSES,
    };
    const progress = validateGraduationProgress(input);
    const csCore = progress.remainingRequirements.find((r) => r.name === "CS Core");
    expect(csCore?.met).toBe(false);
  });

  it("does not count a course completed with a failing grade toward progress", () => {
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items: [
        item("CSCI141", 2023, "FALL", false, 3, "D"), // D is failing (below C-)
      ],
      requirements: REQUIREMENTS,
      courses: COURSES,
    };
    const progress = validateGraduationProgress(input);
    expect(progress.completedCredits).toBe(0);
    const csCore = progress.remainingRequirements.find((r) => r.name === "CS Core");
    expect(csCore?.met).toBe(false);
  });

  it("tracks total credit progress across multiple semesters", () => {
    // 8 semesters × 15 credits = 120 total, all completed
    const items: ValidatorScheduleItem[] = [];
    const courses: GraduationProgressInput["courses"] = {};
    const seasons: Season[] = ["FALL", "SPRING"];
    let courseIndex = 0;
    for (let yr = 2023; yr <= 2026; yr++) {
      for (const season of seasons) {
        for (let i = 0; i < 5; i++) {
          const code = `C${courseIndex++}`;
          items.push(item(code, yr, season, true, 3, "B"));
          courses[code] = { code, credits: 3, collAttribute: null, alv: false, csi: false, nqr: false, prerequisiteCodes: [] };
        }
      }
    }
    const input: GraduationProgressInput = {
      student: { catalogYear: 2023 },
      items,
      requirements: [],
      courses,
    };
    const progress = validateGraduationProgress(input);
    expect(progress.completedCredits).toBe(120);
    expect(progress.percentComplete).toBeCloseTo(100);
  });
});
