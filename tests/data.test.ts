// file: tests/data.test.ts

/**
 * Phase 4 — Data Layer Integration Tests
 *
 * TRUE integration tests: these hit a real PostgreSQL database.
 *
 * Before running:
 *   1. Ensure PostgreSQL is running and DATABASE_URL in .env.test is correct.
 *   2. npx prisma migrate dev --name phase4
 *   3. npx prisma generate
 *
 * All test data uses the prefix "TEST-" for course codes/schedule names and
 * the suffix "@test.wm.edu" for student emails so targeted cleanup is safe
 * even if the database contains real data.
 */

import { prisma } from "@/lib/db";
import { Season } from "@prisma/client";

// ---------------------------------------------------------------------------
// Grade-point utility
// Documents the C- passing threshold; the service layer will mirror this.
// ---------------------------------------------------------------------------

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.3, "A": 4.0,  "A-": 3.7,
  "B+": 3.3, "B": 3.0,  "B-": 2.7,
  "C+": 2.3, "C": 2.0,  "C-": 1.7, // minimum passing grade
  "D+": 1.3, "D": 1.0,  "D-": 0.7,
  "F":  0.0,
};

const MIN_PASSING_POINTS = GRADE_POINTS["C-"]; // 1.7

function isPassing(grade: string): boolean {
  return (GRADE_POINTS[grade] ?? 0) >= MIN_PASSING_POINTS;
}

// ---------------------------------------------------------------------------
// Cleanup helpers — delete test rows in foreign-key-safe order
// ---------------------------------------------------------------------------

const TEST_EMAIL_SUFFIX  = "@test.wm.edu";
const TEST_COURSE_PREFIX = "TEST-";
const TEST_REQ_PREFIX    = "TEST-REQ-";

async function cleanupAll(): Promise<void> {
  await prisma.requirementCourse.deleteMany({
    where: { requirement: { name: { startsWith: TEST_REQ_PREFIX } } },
  });
  await prisma.scheduleItem.deleteMany({
    where: {
      OR: [
        { course:   { code:  { startsWith: TEST_COURSE_PREFIX } } },
        { schedule: { student: { email: { endsWith: TEST_EMAIL_SUFFIX } } } },
      ],
    },
  });
  await prisma.schedule.deleteMany({
    where: { student: { email: { endsWith: TEST_EMAIL_SUFFIX } } },
  });
  await prisma.prerequisite.deleteMany({
    where: {
      OR: [
        { course:       { code: { startsWith: TEST_COURSE_PREFIX } } },
        { prerequisite: { code: { startsWith: TEST_COURSE_PREFIX } } },
      ],
    },
  });
  await prisma.requirement.deleteMany({
    where: { name: { startsWith: TEST_REQ_PREFIX } },
  });
  await prisma.course.deleteMany({
    where: { code: { startsWith: TEST_COURSE_PREFIX } },
  });
  await prisma.student.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_SUFFIX } },
  });
}

beforeAll(async () => {
  // Wipe any leftover state from a previously failed run
  await cleanupAll();
});

afterEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Creating and reading courses
// ---------------------------------------------------------------------------

describe("Course CRUD", () => {
  it("creates and reads back a course with all fields", async () => {
    await prisma.course.create({
      data: {
        code:          "TEST-CS301",
        title:         "Algorithms",
        credits:       3,
        department:    "Computer Science",
        description:   "Design and analysis of algorithms",
        collAttribute: null,
        alv:           false,
        nqr:           true,
        csi:           false,
      },
    });

    const found = await prisma.course.findUnique({ where: { code: "TEST-CS301" } });

    expect(found).not.toBeNull();
    expect(found!.title).toBe("Algorithms");
    expect(found!.credits).toBe(3);
    expect(found!.department).toBe("Computer Science");
    expect(found!.nqr).toBe(true);
    expect(found!.alv).toBe(false);
    expect(found!.csi).toBe(false);
    expect(found!.collAttribute).toBeNull();
  });

  it("enforces unique course codes", async () => {
    await prisma.course.create({
      data: { code: "TEST-CS302", title: "First", credits: 3, department: "CS" },
    });

    await expect(
      prisma.course.create({
        data: { code: "TEST-CS302", title: "Duplicate", credits: 3, department: "CS" },
      })
    ).rejects.toThrow();
  });

  it("defaults alv, nqr, and csi to false when not provided", async () => {
    await prisma.course.create({
      data: { code: "TEST-CS303", title: "Bare Course", credits: 3, department: "CS" },
    });

    const found = await prisma.course.findUnique({ where: { code: "TEST-CS303" } });

    expect(found!.alv).toBe(false);
    expect(found!.nqr).toBe(false);
    expect(found!.csi).toBe(false);
    expect(found!.collAttribute).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Querying by department
// ---------------------------------------------------------------------------

describe("Course queries — department", () => {
  beforeEach(async () => {
    await prisma.course.createMany({
      data: [
        { code: "TEST-CS401", title: "Operating Systems", credits: 3, department: "Computer Science" },
        { code: "TEST-CS402", title: "Networks",          credits: 3, department: "Computer Science" },
        { code: "TEST-PHIL201", title: "Ethics",          credits: 3, department: "Philosophy" },
      ],
    });
  });

  it("returns only courses in the specified department", async () => {
    const results = await prisma.course.findMany({
      where: { department: "Computer Science", code: { startsWith: TEST_COURSE_PREFIX } },
    });

    const codes = results.map((c) => c.code);
    expect(codes).toContain("TEST-CS401");
    expect(codes).toContain("TEST-CS402");
    expect(codes).not.toContain("TEST-PHIL201");
  });

  it("returns an empty array when no courses exist in a department", async () => {
    const results = await prisma.course.findMany({
      where: { department: "Underwater Basket Weaving" },
    });
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Querying by COLL attribute and ALV / NQR / CSI flags
// ---------------------------------------------------------------------------

describe("Course queries — COLL attribute and designation flags", () => {
  beforeEach(async () => {
    await prisma.course.createMany({
      data: [
        {
          code: "TEST-COLL100A", title: "First Year Seminar",
          credits: 1, department: "COLL",
          collAttribute: "COLL 100",
          alv: false, nqr: false, csi: false,
        },
        {
          code: "TEST-COLL200A", title: "COLL 200 Writing",
          credits: 3, department: "COLL",
          collAttribute: "COLL 200",
          alv: true, nqr: false, csi: false,
        },
        {
          code: "TEST-BIO101", title: "Intro Biology",
          credits: 4, department: "Biology",
          collAttribute: null,
          alv: false, nqr: true, csi: false,
        },
        {
          code: "TEST-SOC101", title: "Intro Sociology",
          credits: 3, department: "Sociology",
          collAttribute: null,
          alv: false, nqr: false, csi: true,
        },
        {
          code: "TEST-ENGL201", title: "World Literature",
          credits: 3, department: "English",
          collAttribute: null,
          alv: true, nqr: false, csi: false,
        },
      ],
    });
  });

  it("filters courses by COLL 100 attribute tag", async () => {
    const results = await prisma.course.findMany({
      where: { collAttribute: "COLL 100" },
    });
    expect(results.map((c) => c.code)).toContain("TEST-COLL100A");
    expect(results.map((c) => c.code)).not.toContain("TEST-COLL200A");
  });

  it("filters courses by COLL 200 attribute tag", async () => {
    const results = await prisma.course.findMany({
      where: { collAttribute: "COLL 200" },
    });
    expect(results.map((c) => c.code)).toContain("TEST-COLL200A");
    expect(results.map((c) => c.code)).not.toContain("TEST-COLL100A");
  });

  it("filters courses by NQR designation", async () => {
    const results = await prisma.course.findMany({
      where: { nqr: true, code: { startsWith: TEST_COURSE_PREFIX } },
    });
    const codes = results.map((c) => c.code);
    expect(codes).toContain("TEST-BIO101");
    expect(codes).not.toContain("TEST-SOC101");
    expect(codes).not.toContain("TEST-ENGL201");
  });

  it("filters courses by CSI designation", async () => {
    const results = await prisma.course.findMany({
      where: { csi: true, code: { startsWith: TEST_COURSE_PREFIX } },
    });
    const codes = results.map((c) => c.code);
    expect(codes).toContain("TEST-SOC101");
    expect(codes).not.toContain("TEST-BIO101");
    expect(codes).not.toContain("TEST-ENGL201");
  });

  it("filters courses by ALV designation", async () => {
    const results = await prisma.course.findMany({
      where: { alv: true, code: { startsWith: TEST_COURSE_PREFIX } },
    });
    const codes = results.map((c) => c.code);
    expect(codes).toContain("TEST-COLL200A");
    expect(codes).toContain("TEST-ENGL201");
    expect(codes).not.toContain("TEST-BIO101");
    expect(codes).not.toContain("TEST-SOC101");
  });

  it("combines designation filters (ALV + has a COLL attribute)", async () => {
    const results = await prisma.course.findMany({
      where: {
        alv: true,
        collAttribute: { not: null },
        code: { startsWith: TEST_COURSE_PREFIX },
      },
    });
    const codes = results.map((c) => c.code);
    expect(codes).toContain("TEST-COLL200A");    // ALV and has COLL attribute
    expect(codes).not.toContain("TEST-ENGL201"); // ALV but no COLL attribute
  });

  it("returns courses with no COLL attribute when filtering for null", async () => {
    const results = await prisma.course.findMany({
      where: { collAttribute: null, code: { startsWith: TEST_COURSE_PREFIX } },
    });
    const codes = results.map((c) => c.code);
    expect(codes).toContain("TEST-BIO101");
    expect(codes).toContain("TEST-SOC101");
    expect(codes).toContain("TEST-ENGL201");
    expect(codes).not.toContain("TEST-COLL100A");
    expect(codes).not.toContain("TEST-COLL200A");
  });
});

// ---------------------------------------------------------------------------
// Student and catalog year
// ---------------------------------------------------------------------------

describe("Student — catalog year", () => {
  it("creates a student tied to a catalog year and reads it back", async () => {
    await prisma.student.create({
      data: { email: "alice@test.wm.edu", name: "Alice", catalogYear: 2023 },
    });

    const found = await prisma.student.findUnique({
      where: { email: "alice@test.wm.edu" },
    });

    expect(found).not.toBeNull();
    expect(found!.catalogYear).toBe(2023);
    expect(found!.name).toBe("Alice");
  });

  it("two students can hold different catalog years independently", async () => {
    await prisma.student.createMany({
      data: [
        { email: "s2022@test.wm.edu", name: "Class of 2022", catalogYear: 2022 },
        { email: "s2024@test.wm.edu", name: "Class of 2024", catalogYear: 2024 },
      ],
    });

    const s22 = await prisma.student.findUnique({ where: { email: "s2022@test.wm.edu" } });
    const s24 = await prisma.student.findUnique({ where: { email: "s2024@test.wm.edu" } });

    expect(s22!.catalogYear).toBe(2022);
    expect(s24!.catalogYear).toBe(2024);
  });
});

// ---------------------------------------------------------------------------
// Requirements across catalog years
// ---------------------------------------------------------------------------

describe("Requirements — catalog year versioning", () => {
  it("stores requirements for different catalog years independently", async () => {
    await prisma.requirement.createMany({
      data: [
        { name: "TEST-REQ-COLL400-2023", type: "COLL", catalogYear: 2023, description: "2023 COLL 400" },
        { name: "TEST-REQ-COLL400-2024", type: "COLL", catalogYear: 2024, description: "2024 COLL 400 (revised)" },
      ],
    });

    const reqs2023 = await prisma.requirement.findMany({
      where: { catalogYear: 2023, name: { startsWith: TEST_REQ_PREFIX } },
    });
    const reqs2024 = await prisma.requirement.findMany({
      where: { catalogYear: 2024, name: { startsWith: TEST_REQ_PREFIX } },
    });

    expect(reqs2023).toHaveLength(1);
    expect(reqs2023[0].name).toBe("TEST-REQ-COLL400-2023");

    expect(reqs2024).toHaveLength(1);
    expect(reqs2024[0].name).toBe("TEST-REQ-COLL400-2024");
  });

  it("a student's requirements are scoped to their catalog year", async () => {
    await prisma.requirement.createMany({
      data: [
        { name: "TEST-REQ-MAJOR-2022", type: "MAJOR", catalogYear: 2022 },
        { name: "TEST-REQ-MAJOR-2023", type: "MAJOR", catalogYear: 2023 },
      ],
    });

    const student = await prisma.student.create({
      data: { email: "bob@test.wm.edu", name: "Bob", catalogYear: 2023 },
    });

    const studentReqs = await prisma.requirement.findMany({
      where: {
        catalogYear: student.catalogYear,
        name: { startsWith: TEST_REQ_PREFIX },
      },
    });

    expect(studentReqs).toHaveLength(1);
    expect(studentReqs[0].name).toBe("TEST-REQ-MAJOR-2023");
    expect(studentReqs[0].catalogYear).toBe(student.catalogYear);
  });

  it("adding new-year requirements does not alter old-year rows", async () => {
    await prisma.requirement.create({
      data: { name: "TEST-REQ-ELECTIVE-2023", type: "ELECTIVE", catalogYear: 2023 },
    });

    // Curriculum update: create 2024 rows — never touch 2023 rows
    await prisma.requirement.create({
      data: { name: "TEST-REQ-ELECTIVE-2024", type: "ELECTIVE", catalogYear: 2024 },
    });

    const old = await prisma.requirement.findFirst({
      where: { name: "TEST-REQ-ELECTIVE-2023" },
    });

    expect(old).not.toBeNull();
    expect(old!.catalogYear).toBe(2023);
    expect(old!.type).toBe("ELECTIVE");

    const all = await prisma.requirement.findMany({
      where: { name: { startsWith: TEST_REQ_PREFIX } },
    });
    expect(all).toHaveLength(2);
  });

  it("different requirement types coexist within the same catalog year", async () => {
    await prisma.requirement.createMany({
      data: [
        { name: "TEST-REQ-COLL-2024",     type: "COLL",     catalogYear: 2024 },
        { name: "TEST-REQ-MAJOR-2024",    type: "MAJOR",    catalogYear: 2024 },
        { name: "TEST-REQ-ELECTIVE-2024", type: "ELECTIVE", catalogYear: 2024 },
      ],
    });

    const reqs = await prisma.requirement.findMany({
      where: { catalogYear: 2024, name: { startsWith: TEST_REQ_PREFIX } },
    });
    const types = reqs.map((r) => r.type);

    expect(types).toContain("COLL");
    expect(types).toContain("MAJOR");
    expect(types).toContain("ELECTIVE");
  });
});

// ---------------------------------------------------------------------------
// Student completed course tracking
// ---------------------------------------------------------------------------

describe("Student completed course tracking", () => {
  let studentId: string;
  let scheduleId: string;
  let courseAId: string;
  let courseBId: string;

  beforeEach(async () => {
    const student = await prisma.student.create({
      data: { email: "tracker@test.wm.edu", name: "Tracker", catalogYear: 2023 },
    });
    studentId = student.id;

    const schedule = await prisma.schedule.create({
      data: { studentId, name: "TEST-Tracker Plan" },
    });
    scheduleId = schedule.id;

    const [a, b] = await Promise.all([
      prisma.course.create({
        data: { code: "TEST-HIST101", title: "History I",  credits: 3, department: "History" },
      }),
      prisma.course.create({
        data: { code: "TEST-HIST102", title: "History II", credits: 3, department: "History" },
      }),
    ]);
    courseAId = a.id;
    courseBId = b.id;
  });

  it("marks a schedule item completed when grade is exactly C-", async () => {
    const item = await prisma.scheduleItem.create({
      data: {
        scheduleId, courseId: courseAId,
        year: 2024, season: Season.FALL,
        grade: "C-", completed: isPassing("C-"),
      },
    });

    expect(item.grade).toBe("C-");
    expect(item.completed).toBe(true);
  });

  it("does not mark a schedule item completed when grade is D+", async () => {
    const item = await prisma.scheduleItem.create({
      data: {
        scheduleId, courseId: courseAId,
        year: 2024, season: Season.FALL,
        grade: "D+", completed: isPassing("D+"),
      },
    });

    expect(item.grade).toBe("D+");
    expect(item.completed).toBe(false);
  });

  it("grade boundary — A passes, F fails", async () => {
    const pass = await prisma.scheduleItem.create({
      data: {
        scheduleId, courseId: courseAId,
        year: 2024, season: Season.FALL,
        grade: "A", completed: isPassing("A"),
      },
    });
    const fail = await prisma.scheduleItem.create({
      data: {
        scheduleId, courseId: courseBId,
        year: 2024, season: Season.SPRING,
        grade: "F", completed: isPassing("F"),
      },
    });

    expect(pass.completed).toBe(true);
    expect(fail.completed).toBe(false);
  });

  it("a schedule item with no grade recorded is not completed", async () => {
    const item = await prisma.scheduleItem.create({
      data: {
        scheduleId, courseId: courseAId,
        year: 2025, season: Season.FALL,
        grade: null, completed: false,
      },
    });

    expect(item.grade).toBeNull();
    expect(item.completed).toBe(false);
  });

  it("queries only completed courses for a student across their schedule", async () => {
    await prisma.scheduleItem.createMany({
      data: [
        {
          scheduleId, courseId: courseAId,
          year: 2024, season: Season.FALL,
          grade: "B+", completed: true,
        },
        {
          scheduleId, courseId: courseBId,
          year: 2024, season: Season.SPRING,
          grade: "D", completed: false,
        },
      ],
    });

    const completed = await prisma.scheduleItem.findMany({
      where: { schedule: { studentId }, completed: true },
      include: { course: true },
    });

    expect(completed).toHaveLength(1);
    expect(completed[0].course.code).toBe("TEST-HIST101");
  });

  it("isPassing covers all standard letter grades correctly", () => {
    // Passing (C- and above)
    for (const grade of ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-"]) {
      expect(isPassing(grade)).toBe(true);
    }
    // Failing (below C-)
    for (const grade of ["D+", "D", "D-", "F"]) {
      expect(isPassing(grade)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Schedule creation and linking
// ---------------------------------------------------------------------------

describe("Schedule creation and linking", () => {
  let studentId: string;
  let courseId: string;

  beforeEach(async () => {
    const student = await prisma.student.create({
      data: { email: "planner@test.wm.edu", name: "Planner", catalogYear: 2024 },
    });
    studentId = student.id;

    const course = await prisma.course.create({
      data: { code: "TEST-MATH201", title: "Calculus II", credits: 4, department: "Mathematics" },
    });
    courseId = course.id;
  });

  it("creates a schedule and links it to the correct student", async () => {
    const schedule = await prisma.schedule.create({
      data: { studentId, name: "TEST-Four Year Plan" },
    });

    const found = await prisma.schedule.findUnique({
      where: { id: schedule.id },
      include: { student: true },
    });

    expect(found).not.toBeNull();
    expect(found!.name).toBe("TEST-Four Year Plan");
    expect(found!.student.email).toBe("planner@test.wm.edu");
  });

  it("stores schedule items with structured year and season", async () => {
    const schedule = await prisma.schedule.create({
      data: { studentId, name: "TEST-Draft A" },
    });

    const item = await prisma.scheduleItem.create({
      data: { scheduleId: schedule.id, courseId, year: 2025, season: Season.FALL },
    });

    expect(item.year).toBe(2025);
    expect(item.season).toBe(Season.FALL);
  });

  it("accepts all four seasons as valid schedule item values", async () => {
    const schedule = await prisma.schedule.create({
      data: { studentId, name: "TEST-All Seasons" },
    });

    const extra = await prisma.course.createMany({
      data: [
        { code: "TEST-BIOL101", title: "Biology",  credits: 3, department: "Biology" },
        { code: "TEST-CHEM101", title: "Chemistry",credits: 3, department: "Chemistry" },
        { code: "TEST-PHYS101", title: "Physics",  credits: 3, department: "Physics" },
      ],
    });

    const [bio, chem, phys] = await prisma.course.findMany({
      where: { code: { in: ["TEST-BIOL101", "TEST-CHEM101", "TEST-PHYS101"] } },
    });

    await prisma.scheduleItem.createMany({
      data: [
        { scheduleId: schedule.id, courseId,        year: 2025, season: Season.FALL   },
        { scheduleId: schedule.id, courseId: bio.id,  year: 2025, season: Season.SPRING },
        { scheduleId: schedule.id, courseId: chem.id, year: 2025, season: Season.SUMMER },
        { scheduleId: schedule.id, courseId: phys.id, year: 2025, season: Season.WINTER },
      ],
    });

    const items = await prisma.scheduleItem.findMany({
      where: { scheduleId: schedule.id },
    });

    const seasons = items.map((i) => i.season);
    expect(seasons).toContain(Season.FALL);
    expect(seasons).toContain(Season.SPRING);
    expect(seasons).toContain(Season.SUMMER);
    expect(seasons).toContain(Season.WINTER);
  });

  it("a student can hold multiple independent draft schedules", async () => {
    await prisma.schedule.createMany({
      data: [
        { studentId, name: "TEST-Draft A" },
        { studentId, name: "TEST-Draft B" },
        { studentId, name: "TEST-Draft C" },
      ],
    });

    const schedules = await prisma.schedule.findMany({
      where: { studentId, name: { startsWith: "TEST-Draft" } },
    });

    expect(schedules).toHaveLength(3);
    const names = schedules.map((s) => s.name);
    expect(names).toContain("TEST-Draft A");
    expect(names).toContain("TEST-Draft B");
    expect(names).toContain("TEST-Draft C");
  });

  it("includes linked course data when fetching a schedule with items", async () => {
    const schedule = await prisma.schedule.create({
      data: { studentId, name: "TEST-Linked Plan" },
    });

    await prisma.scheduleItem.create({
      data: { scheduleId: schedule.id, courseId, year: 2025, season: Season.SPRING },
    });

    const found = await prisma.schedule.findUnique({
      where: { id: schedule.id },
      include: { items: { include: { course: true } } },
    });

    expect(found!.items).toHaveLength(1);
    expect(found!.items[0].course.code).toBe("TEST-MATH201");
    expect(found!.items[0].year).toBe(2025);
    expect(found!.items[0].season).toBe(Season.SPRING);
  });

  it("prevents adding the same course to the same schedule twice", async () => {
    const schedule = await prisma.schedule.create({
      data: { studentId, name: "TEST-Duplicate Test" },
    });

    await prisma.scheduleItem.create({
      data: { scheduleId: schedule.id, courseId, year: 2025, season: Season.FALL },
    });

    await expect(
      prisma.scheduleItem.create({
        data: { scheduleId: schedule.id, courseId, year: 2026, season: Season.SPRING },
      })
    ).rejects.toThrow();
  });
});
