// file: tests/ai-validator.test.ts

import { validateAISchedule } from "@/lib/ai-validator/validator";
import type {
  FullScheduleInput,
  ValidatorCourse,
  ValidatorScheduleItem,
  Season,
} from "@/lib/validator/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCourse(
  code: string,
  overrides: Partial<ValidatorCourse> = {}
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
  year: number,
  season: Season,
  overrides: Partial<ValidatorScheduleItem> = {}
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

function buildInput(overrides: Partial<FullScheduleInput> = {}): FullScheduleInput {
  return {
    student: { id: "stu-1", catalogYear: 2024 },
    items: [],
    courses: {},
    collRequirements: [],
    majorRequirements: [],
    ...overrides,
  };
}

// A minimal fully-valid one-semester schedule (12 cr, all requirements met).
const VALID_COURSES = {
  CSCI141: makeCourse("CSCI141"),
  ENGL101: makeCourse("ENGL101", { collAttribute: "COLL 100" }),
  HIST101: makeCourse("HIST101"),
  MATH112: makeCourse("MATH112"),
};

const VALID_ITEMS: ValidatorScheduleItem[] = [
  makeItem("CSCI141", 2024, "FALL"),
  makeItem("ENGL101", 2024, "FALL"),
  makeItem("HIST101", 2024, "FALL"),
  makeItem("MATH112", 2024, "FALL"),
];

const VALID_INPUT: FullScheduleInput = buildInput({
  items: VALID_ITEMS,
  courses: VALID_COURSES,
  collRequirements: ["COLL 100"],
  majorRequirements: ["CSCI141"],
});

// ---------------------------------------------------------------------------
// Nonexistent courses
// ---------------------------------------------------------------------------

describe("validateAISchedule() — nonexistent courses", () => {
  it("returns INVALID_COURSE for a course code not present in the catalog", () => {
    const input = buildInput({
      items: [makeItem("FAKE999", 2024, "FALL")],
      courses: {},
    });
    const result = validateAISchedule(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "INVALID_COURSE", courseCode: "FAKE999" }),
      ])
    );
  });

  it("returns one INVALID_COURSE error per nonexistent course", () => {
    const input = buildInput({
      items: [
        makeItem("FAKE001", 2024, "FALL"),
        makeItem("FAKE002", 2024, "FALL"),
      ],
      courses: {},
    });
    const result = validateAISchedule(input);
    const invalidErrors = result.errors.filter((e) => e.type === "INVALID_COURSE");
    expect(invalidErrors).toHaveLength(2);
  });

  it("does not produce INVALID_COURSE errors for courses that exist in the catalog", () => {
    const result = validateAISchedule(VALID_INPUT);
    const invalidErrors = result.errors.filter((e) => e.type === "INVALID_COURSE");
    expect(invalidErrors).toHaveLength(0);
  });

  it("flags only the nonexistent course when mixed with valid ones", () => {
    const input = buildInput({
      items: [
        makeItem("CSCI141", 2024, "FALL"),
        makeItem("HALLUCINATED", 2024, "FALL"),
        makeItem("MATH112", 2024, "FALL"),
      ],
      courses: {
        CSCI141: makeCourse("CSCI141"),
        MATH112: makeCourse("MATH112"),
        // HALLUCINATED intentionally absent
      },
    });
    const result = validateAISchedule(input);
    const invalidErrors = result.errors.filter((e) => e.type === "INVALID_COURSE");
    expect(invalidErrors).toHaveLength(1);
    expect(invalidErrors[0].courseCode).toBe("HALLUCINATED");
  });

  it("each INVALID_COURSE error includes a descriptive message", () => {
    const input = buildInput({
      items: [makeItem("FAKE999", 2024, "FALL")],
      courses: {},
    });
    const result = validateAISchedule(input);
    const err = result.errors.find((e) => e.type === "INVALID_COURSE");
    expect(typeof err?.message).toBe("string");
    expect(err!.message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Invalid prerequisite chains
// ---------------------------------------------------------------------------

describe("validateAISchedule() — invalid prerequisite chains", () => {
  it("returns PREREQUISITE_NOT_MET when a course is placed before its prerequisite", () => {
    const input = buildInput({
      items: [
        makeItem("CSCI141", 2025, "SPRING"),          // prereq placed AFTER
        makeItem("CSCI142", 2024, "FALL", { credits: 4 }), // dependent placed BEFORE
        makeItem("HIST101", 2024, "FALL"),
        makeItem("MATH112", 2024, "FALL"),
        makeItem("ENGL101", 2024, "FALL"),
      ],
      courses: {
        CSCI141: makeCourse("CSCI141"),
        CSCI142: makeCourse("CSCI142", {
          credits: 4,
          prerequisiteCodes: ["CSCI141"],
        }),
        HIST101: makeCourse("HIST101"),
        MATH112: makeCourse("MATH112"),
        ENGL101: makeCourse("ENGL101"),
      },
    });
    const result = validateAISchedule(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "PREREQUISITE_NOT_MET",
          courseCode: "CSCI141",
        }),
      ])
    );
  });

  it("returns PREREQUISITE_NOT_MET when prerequisite and dependent are in the same semester", () => {
    const input = buildInput({
      items: [
        makeItem("CSCI141", 2024, "FALL"),
        makeItem("CSCI142", 2024, "FALL", { credits: 4 }), // same semester as prereq
        makeItem("HIST101", 2024, "FALL"),
        makeItem("MATH112", 2024, "FALL"),
      ],
      courses: {
        CSCI141: makeCourse("CSCI141"),
        CSCI142: makeCourse("CSCI142", {
          credits: 4,
          prerequisiteCodes: ["CSCI141"],
        }),
        HIST101: makeCourse("HIST101"),
        MATH112: makeCourse("MATH112"),
      },
    });
    const result = validateAISchedule(input);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PREREQUISITE_NOT_MET" }),
      ])
    );
  });

  it("does not return prerequisite errors when all prerequisites are satisfied", () => {
    const input = buildInput({
      items: [
        makeItem("CSCI141", 2024, "FALL"),
        makeItem("HIST101", 2024, "FALL"),
        makeItem("MATH112", 2024, "FALL"),
        makeItem("ENGL101", 2024, "FALL"),
        makeItem("CSCI142", 2025, "SPRING", { credits: 4 }), // after CSCI141 ✓
        makeItem("PHIL101", 2025, "SPRING"),
        makeItem("ECON101", 2025, "SPRING"),
        makeItem("BIOL101", 2025, "SPRING"),
      ],
      courses: {
        CSCI141: makeCourse("CSCI141"),
        CSCI142: makeCourse("CSCI142", {
          credits: 4,
          prerequisiteCodes: ["CSCI141"],
        }),
        HIST101: makeCourse("HIST101"),
        MATH112: makeCourse("MATH112"),
        ENGL101: makeCourse("ENGL101"),
        PHIL101: makeCourse("PHIL101"),
        ECON101: makeCourse("ECON101"),
        BIOL101: makeCourse("BIOL101"),
      },
    });
    const result = validateAISchedule(input);
    const prereqErrors = result.errors.filter(
      (e) => e.type === "PREREQUISITE_NOT_MET"
    );
    expect(prereqErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Impossible schedules
// ---------------------------------------------------------------------------

describe("validateAISchedule() — impossible schedules", () => {
  it("returns CREDIT_LIMIT_EXCEEDED when a semester exceeds 18 credits", () => {
    // 7 × 3 = 21 credits in one semester
    const items = Array.from({ length: 7 }, (_, i) =>
      makeItem(`COURSE${i}`, 2024, "FALL")
    );
    const courses = Object.fromEntries(
      items.map((it) => [it.courseCode, makeCourse(it.courseCode)])
    );
    const result = validateAISchedule(buildInput({ items, courses }));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "CREDIT_LIMIT_EXCEEDED" }),
      ])
    );
  });

  it("returns BELOW_MINIMUM_CREDITS when a semester has fewer than 12 credits", () => {
    const input = buildInput({
      items: [makeItem("CSCI141", 2024, "FALL")], // 3 credits only
      courses: { CSCI141: makeCourse("CSCI141") },
    });
    const result = validateAISchedule(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "BELOW_MINIMUM_CREDITS" }),
      ])
    );
  });

  it("returns MISSING_COLL when a required COLL level is not satisfied", () => {
    const input = buildInput({
      items: VALID_ITEMS,
      courses: VALID_COURSES,
      collRequirements: ["COLL 100", "COLL 200"], // COLL 200 not satisfied
      majorRequirements: [],
    });
    const result = validateAISchedule(input);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "MISSING_COLL" }),
      ])
    );
  });

  it("returns MISSING_MAJOR_COURSE when a required major course is absent", () => {
    const input = buildInput({
      items: VALID_ITEMS,
      courses: VALID_COURSES,
      collRequirements: ["COLL 100"],
      majorRequirements: ["CSCI141", "CSCI303"], // CSCI303 not in items
    });
    const result = validateAISchedule(input);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "MISSING_MAJOR_COURSE",
          courseCode: "CSCI303",
        }),
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// Structured validation errors
// ---------------------------------------------------------------------------

describe("validateAISchedule() — structured validation errors", () => {
  it("returns valid:true and an empty errors array for a fully valid schedule", () => {
    const result = validateAISchedule(VALID_INPUT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid:false when any error is present", () => {
    const input = buildInput({
      items: [makeItem("FAKE999", 2024, "FALL")],
      courses: {},
    });
    expect(validateAISchedule(input).valid).toBe(false);
  });

  it("each error object has a type and a non-empty message", () => {
    const input = buildInput({
      items: [makeItem("FAKE999", 2024, "FALL")],
      courses: {},
    });
    const { errors } = validateAISchedule(input);
    for (const err of errors) {
      expect(typeof err.type).toBe("string");
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it("returns ALL errors, not just the first one", () => {
    // Two distinct problems: nonexistent course + missing major requirement
    const input = buildInput({
      items: [
        ...VALID_ITEMS,
        makeItem("FAKE999", 2024, "FALL"),
      ],
      courses: VALID_COURSES, // FAKE999 absent
      collRequirements: ["COLL 100"],
      majorRequirements: ["CSCI141", "CSCI303"], // CSCI303 missing
    });
    const { errors } = validateAISchedule(input);
    const types = errors.map((e) => e.type);
    expect(types).toContain("INVALID_COURSE");
    expect(types).toContain("MISSING_MAJOR_COURSE");
  });
});

// ---------------------------------------------------------------------------
// No auto-correction
// ---------------------------------------------------------------------------

describe("validateAISchedule() — no auto-correction", () => {
  it("does not remove invalid courses from the items array", () => {
    const items = [makeItem("FAKE999", 2024, "FALL")];
    const input = buildInput({ items, courses: {} });
    validateAISchedule(input);
    expect(input.items).toHaveLength(1);
    expect(input.items[0].courseCode).toBe("FAKE999");
  });

  it("does not reorder items to satisfy prerequisite constraints", () => {
    const items = [
      makeItem("CSCI142", 2024, "FALL", { credits: 4 }), // placed before prereq
      makeItem("CSCI141", 2025, "SPRING"),
      makeItem("HIST101", 2024, "FALL"),
      makeItem("MATH112", 2024, "FALL"),
      makeItem("ENGL101", 2024, "FALL"),
    ];
    const courses = {
      CSCI141: makeCourse("CSCI141"),
      CSCI142: makeCourse("CSCI142", {
        credits: 4,
        prerequisiteCodes: ["CSCI141"],
      }),
      HIST101: makeCourse("HIST101"),
      MATH112: makeCourse("MATH112"),
      ENGL101: makeCourse("ENGL101"),
    };
    const input = buildInput({ items, courses });
    validateAISchedule(input);
    // First item must still be CSCI142, not CSCI141
    expect(input.items[0].courseCode).toBe("CSCI142");
  });

  it("does not add missing COLL courses to satisfy requirements", () => {
    const input = buildInput({
      items: VALID_ITEMS,
      courses: VALID_COURSES,
      collRequirements: ["COLL 100", "COLL 200"],
      majorRequirements: [],
    });
    const before = input.items.length;
    validateAISchedule(input);
    expect(input.items.length).toBe(before);
  });

  it("does not modify the courses catalog passed in", () => {
    const courses = { CSCI141: makeCourse("CSCI141") };
    const input = buildInput({
      items: [makeItem("FAKE999", 2024, "FALL")],
      courses,
    });
    validateAISchedule(input);
    expect(Object.keys(input.courses)).toEqual(["CSCI141"]);
  });

  it("does not modify the collRequirements array", () => {
    const input = buildInput({
      items: VALID_ITEMS,
      courses: VALID_COURSES,
      collRequirements: ["COLL 100", "COLL 200"],
    });
    validateAISchedule(input);
    expect(input.collRequirements).toEqual(["COLL 100", "COLL 200"]);
  });
});
