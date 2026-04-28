// file: tests/api.test.ts

/**
 * Phase 11 — API Endpoints
 *
 * Contract-first tests (TDD) for three new API routes:
 *   GET  /api/courses/search         — filterable, paginated course catalog
 *   POST /api/schedule/generate      — AI schedule generation
 *   GET  /api/student/[id]/progress  — graduation progress
 *
 * All routes require authentication via the `session` cookie.
 * Role enforcement mirrors the pattern from authorization.test.ts.
 *
 * Session tokens:
 *   "student-token"  → student-123  (role: student)
 *   "advisor-token"  → advisor-456  (role: advisor, assignedStudents: [student-123])
 *   "admin-token"    → admin-789    (role: admin)
 *   any other token  → 401
 */

import request from "supertest";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { NextRequest } from "next/server";
import type { GraduationProgress } from "@/lib/validator/types";
import type { GeneratedPlan } from "@/lib/generator/types";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any route-handler imports
// ---------------------------------------------------------------------------

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
          "advisor-token": {
            id: "advisor-456",
            email: "advisor@wm.edu",
            user_metadata: {
              role: "advisor",
              assignedStudents: ["student-123"],
            },
          },
          "admin-token": {
            id: "admin-789",
            email: "admin@wm.edu",
            user_metadata: { role: "admin" },
          },
        };
        const user = users[token];
        if (user) return { data: { user }, error: null };
        return {
          data: { user: null },
          error: { message: "Invalid or expired token", status: 401 },
        };
      }),
    },
  })),
}));

// Mock Prisma so tests never hit a real database
jest.mock("@/lib/db", () => ({
  prisma: {
    course: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    scheduleItem: {
      findMany: jest.fn(),
    },
    requirement: {
      findMany: jest.fn(),
    },
  },
}));

// Mock the schedule generator — tests exercise only the HTTP contract
jest.mock("@/lib/generator/generator", () => ({
  generateSchedule: jest.fn(),
}));

// Mock graduation-progress — real logic is tested in validator.test.ts
jest.mock("@/lib/validator/validator", () => ({
  ...jest.requireActual("@/lib/validator/validator"),
  validateGraduationProgress: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Route-handler imports (will fail until Phase 11 routes are implemented)
// ---------------------------------------------------------------------------

import { GET as searchHandler } from "@/app/api/courses/search/route";
import { POST as generateHandler } from "@/app/api/schedule/generate/route";
import { GET as progressHandler } from "@/app/api/student/[id]/progress/route";
import { prisma } from "@/lib/db";
import { generateSchedule } from "@/lib/generator/generator";
import { validateGraduationProgress } from "@/lib/validator/validator";

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockCourseFindMany = prisma.course.findMany as jest.Mock;
const mockCourseCount    = prisma.course.count as jest.Mock;
const mockItemFindMany   = prisma.scheduleItem.findMany as jest.Mock;
const mockReqFindMany    = prisma.requirement.findMany as jest.Mock;
const mockGenerate       = generateSchedule as jest.Mock;
const mockProgress       = validateGraduationProgress as jest.Mock;

// ---------------------------------------------------------------------------
// Sample fixtures
// ---------------------------------------------------------------------------

const SAMPLE_DB_COURSES = [
  {
    code: "CSCI141",
    title: "Intro to Computer Science",
    department: "CSCI",
    credits: 3,
    collAttribute: null,
    description: null,
    prerequisites: [],
    sections: [],
  },
  {
    code: "ENGL101",
    title: "Introduction to Writing",
    department: "ENGL",
    credits: 3,
    collAttribute: "COLL 100",
    description: null,
    prerequisites: [],
    sections: [{ instructor: "Dr. Jones", location: "Blair 212", days: "TR" }],
  },
];

const SAMPLE_PLAN: GeneratedPlan = {
  semesters: [
    {
      year: 2024,
      season: "FALL",
      courses: [{ code: "CSCI141", credits: 3, recommendedSectionId: null }],
      totalCredits: 3,
    },
  ],
  totalCredits: 3,
};

const SAMPLE_PROGRESS: GraduationProgress = {
  completedCredits: 30,
  requiredCredits: 120,
  percentComplete: 25,
  remainingRequirements: [
    { name: "COLL 100", type: "COLL", met: true },
    { name: "CS Major", type: "MAJOR", met: false },
  ],
};

const MINIMAL_GENERATE_BODY = {
  student: { id: "student-123", catalogYear: 2024 },
  completedCourses: [],
  majorRequirements: [
    {
      code: "CSCI141",
      credits: 3,
      prerequisiteCodes: [],
      collAttribute: null,
      seasons: ["FALL", "SPRING"],
    },
  ],
  collRequirements: [],
  electivePool: [],
  electiveCreditsNeeded: 0,
  plannedSemesters: [{ year: 2024, season: "FALL" }],
  availableSections: {},
  preferences: {},
};

// ---------------------------------------------------------------------------
// Test-server helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
  });
}

/**
 * Dispatches to the three Phase 11 route handlers.
 * Cookie headers are forwarded so withRole middleware can read the session.
 */
function buildApiServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url ?? "/";
    const url    = `http://localhost${rawUrl}`;
    const method = (req.method ?? "GET").toUpperCase();
    const body   = await readBody(req);

    const initHeaders: Record<string, string> = {};
    if (req.headers.cookie) initHeaders["cookie"] = req.headers.cookie;
    if (req.headers["content-type"]) {
      initHeaders["content-type"] = req.headers["content-type"] as string;
    }

    const nextReq = new NextRequest(url, {
      method,
      headers: initHeaders,
      body: body || undefined,
    });

    let response: Response;

    const courseSearchMatch   = rawUrl.match(/^\/api\/courses\/search/);
    const studentProgressMatch = rawUrl.match(/^\/api\/student\/([^/]+)\/progress$/);

    if (courseSearchMatch && method === "GET") {
      response = await searchHandler(nextReq);
    } else if (rawUrl === "/api/schedule/generate" && method === "POST") {
      response = await generateHandler(nextReq);
    } else if (studentProgressMatch && method === "GET") {
      const id = studentProgressMatch[1];
      response = await progressHandler(nextReq, { params: { id } });
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const responseBody = await response.json();
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(JSON.stringify(responseBody));
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// GET /api/courses/search — filtering
// ---------------------------------------------------------------------------

describe("GET /api/courses/search — filtering", () => {
  beforeEach(() => {
    mockCourseFindMany.mockResolvedValue(SAMPLE_DB_COURSES);
    mockCourseCount.mockResolvedValue(SAMPLE_DB_COURSES.length);
  });

  afterEach(() => jest.clearAllMocks());

  it("returns 200 and a courses array for an authenticated request", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/courses/search")
      .set("Cookie", "session=student-token");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.courses)).toBe(true);
    await closeServer(server);
  });

  it("passes the department filter to the data layer", async () => {
    const server = buildApiServer();
    await request(server)
      .get("/api/courses/search?department=CSCI")
      .set("Cookie", "session=student-token");

    expect(mockCourseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ department: expect.anything() }),
      })
    );
    await closeServer(server);
  });

  it("passes the code filter to the data layer", async () => {
    const server = buildApiServer();
    await request(server)
      .get("/api/courses/search?code=CSCI141")
      .set("Cookie", "session=student-token");

    expect(mockCourseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ code: expect.anything() }),
      })
    );
    await closeServer(server);
  });

  it("passes the title filter to the data layer", async () => {
    const server = buildApiServer();
    await request(server)
      .get("/api/courses/search?title=Computer")
      .set("Cookie", "session=student-token");

    expect(mockCourseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ title: expect.anything() }),
      })
    );
    await closeServer(server);
  });

  it("passes the collAttribute filter to the data layer", async () => {
    const server = buildApiServer();
    await request(server)
      .get("/api/courses/search?collAttribute=COLL+100")
      .set("Cookie", "session=student-token");

    expect(mockCourseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ collAttribute: expect.anything() }),
      })
    );
    await closeServer(server);
  });

  it("passes the credits filter to the data layer", async () => {
    const server = buildApiServer();
    await request(server)
      .get("/api/courses/search?credits=3")
      .set("Cookie", "session=student-token");

    expect(mockCourseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ credits: expect.anything() }),
      })
    );
    await closeServer(server);
  });

  it("applies the days filter when provided (data layer must be called)", async () => {
    const server = buildApiServer();
    await request(server)
      .get("/api/courses/search?days=MWF")
      .set("Cookie", "session=student-token");

    // Days live on sections — the exact join strategy is up to the implementation;
    // we just verify a query was made.
    expect(mockCourseFindMany).toHaveBeenCalled();
    await closeServer(server);
  });

  it("returns 200 and an empty courses array when no courses match", async () => {
    mockCourseFindMany.mockResolvedValue([]);
    mockCourseCount.mockResolvedValue(0);

    const server = buildApiServer();
    const res = await request(server)
      .get("/api/courses/search?department=XXXX")
      .set("Cookie", "session=student-token");

    expect(res.status).toBe(200);
    expect(res.body.courses).toEqual([]);
    await closeServer(server);
  });

  it("each returned course includes code, title, department, credits, and collAttribute", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/courses/search")
      .set("Cookie", "session=student-token");

    for (const course of res.body.courses) {
      expect(typeof course.code).toBe("string");
      expect(typeof course.title).toBe("string");
      expect(typeof course.department).toBe("string");
      expect(typeof course.credits).toBe("number");
      // collAttribute is string | null
      expect(
        course.collAttribute === null || typeof course.collAttribute === "string"
      ).toBe(true);
    }
    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// GET /api/courses/search — pagination
// ---------------------------------------------------------------------------

describe("GET /api/courses/search — pagination", () => {
  beforeEach(() => {
    mockCourseFindMany.mockResolvedValue(SAMPLE_DB_COURSES);
    mockCourseCount.mockResolvedValue(50);
  });

  afterEach(() => jest.clearAllMocks());

  it("response includes total, page, and limit fields", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/courses/search?page=1&limit=10")
      .set("Cookie", "session=student-token");

    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.page).toBe("number");
    expect(typeof res.body.limit).toBe("number");
    await closeServer(server);
  });

  it("passes skip and take to the data layer for page 2 with limit 10", async () => {
    const server = buildApiServer();
    await request(server)
      .get("/api/courses/search?page=2&limit=10")
      .set("Cookie", "session=student-token");

    expect(mockCourseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
    await closeServer(server);
  });

  it("defaults to page 1 with a positive limit when pagination params are absent", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/courses/search")
      .set("Cookie", "session=student-token");

    expect(res.body.page).toBe(1);
    expect(typeof res.body.limit).toBe("number");
    expect(res.body.limit).toBeGreaterThan(0);
    await closeServer(server);
  });

  it("total reflects the unfiltered count, not just the current page size", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/courses/search?limit=2")
      .set("Cookie", "session=student-token");

    // mockCourseCount returns 50; the returned total must match
    expect(res.body.total).toBe(50);
    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// GET /api/courses/search — auth enforcement
// ---------------------------------------------------------------------------

describe("GET /api/courses/search — auth enforcement", () => {
  beforeEach(() => {
    mockCourseFindMany.mockResolvedValue(SAMPLE_DB_COURSES);
    mockCourseCount.mockResolvedValue(SAMPLE_DB_COURSES.length);
  });

  afterEach(() => jest.clearAllMocks());

  it("returns 401 when no session cookie is present", async () => {
    const server = buildApiServer();
    const res = await request(server).get("/api/courses/search");
    expect(res.status).toBe(401);
    await closeServer(server);
  });

  it("returns 401 when the session token is invalid", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/courses/search")
      .set("Cookie", "session=bad-token");
    expect(res.status).toBe(401);
    await closeServer(server);
  });

  it("student, advisor, and admin can all search courses", async () => {
    for (const token of ["student-token", "advisor-token", "admin-token"]) {
      const server = buildApiServer();
      const res = await request(server)
        .get("/api/courses/search")
        .set("Cookie", `session=${token}`);
      expect(res.status).toBe(200);
      await closeServer(server);
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/schedule/generate — happy path
// ---------------------------------------------------------------------------

describe("POST /api/schedule/generate — happy path", () => {
  beforeEach(() => {
    mockGenerate.mockReturnValue({ success: true, plan: SAMPLE_PLAN });
  });

  afterEach(() => jest.clearAllMocks());

  it("returns 200 and a GeneratedPlan when the generator succeeds", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send(MINIMAL_GENERATE_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.plan).toBeDefined();
    expect(Array.isArray(res.body.plan.semesters)).toBe(true);
    await closeServer(server);
  });

  it("each semester in the plan has year, season, courses, and totalCredits", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send(MINIMAL_GENERATE_BODY);

    const semester = res.body.plan.semesters[0];
    expect(typeof semester.year).toBe("number");
    expect(typeof semester.season).toBe("string");
    expect(Array.isArray(semester.courses)).toBe(true);
    expect(typeof semester.totalCredits).toBe("number");
    await closeServer(server);
  });

  it("passes avoidEarlyMorning preference through to generateSchedule", async () => {
    const server = buildApiServer();
    await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send({ ...MINIMAL_GENERATE_BODY, preferences: { avoidEarlyMorning: true } });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({ avoidEarlyMorning: true }),
      })
    );
    await closeServer(server);
  });

  it("passes noFridayClasses preference through to generateSchedule", async () => {
    const server = buildApiServer();
    await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send({ ...MINIMAL_GENERATE_BODY, preferences: { noFridayClasses: true } });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({ noFridayClasses: true }),
      })
    );
    await closeServer(server);
  });

  it("response totalCredits matches the sum of semester credits", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send(MINIMAL_GENERATE_BODY);

    expect(res.body.plan.totalCredits).toBe(SAMPLE_PLAN.totalCredits);
    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// POST /api/schedule/generate — error cases
// ---------------------------------------------------------------------------

describe("POST /api/schedule/generate — error cases", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns 400 when the request body is empty", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    await closeServer(server);
  });

  it("returns 400 when plannedSemesters is missing", async () => {
    const { plannedSemesters: _, ...bodyWithout } = MINIMAL_GENERATE_BODY;
    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send(bodyWithout);

    expect(res.status).toBe(400);
    await closeServer(server);
  });

  it("returns 422 and generator errors when generateSchedule reports failure", async () => {
    mockGenerate.mockReturnValue({
      success: false,
      errors: [
        { type: "PREREQUISITE_CYCLE", message: "Cycle detected between CSCI141 and CSCI142" },
      ],
    });

    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send(MINIMAL_GENERATE_BODY);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0].type).toBe("PREREQUISITE_CYCLE");
    await closeServer(server);
  });

  it("each generator error in a 422 response has type and message", async () => {
    mockGenerate.mockReturnValue({
      success: false,
      errors: [
        { type: "CANNOT_FIT_COURSES", message: "Cannot fit all courses" },
        { type: "COURSE_NOT_AVAILABLE", message: "CSCI141 not offered in SUMMER" },
      ],
    });

    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=student-token")
      .set("Content-Type", "application/json")
      .send(MINIMAL_GENERATE_BODY);

    for (const err of res.body.errors) {
      expect(typeof err.type).toBe("string");
      expect(typeof err.message).toBe("string");
    }
    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// POST /api/schedule/generate — auth enforcement
// ---------------------------------------------------------------------------

describe("POST /api/schedule/generate — auth enforcement", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns 401 when no session cookie is present", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Content-Type", "application/json")
      .send(MINIMAL_GENERATE_BODY);
    expect(res.status).toBe(401);
    await closeServer(server);
  });

  it("returns 401 when the session token is invalid", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .post("/api/schedule/generate")
      .set("Cookie", "session=bad-token")
      .set("Content-Type", "application/json")
      .send(MINIMAL_GENERATE_BODY);
    expect(res.status).toBe(401);
    await closeServer(server);
  });

  it("student, advisor, and admin can all call the generate endpoint", async () => {
    mockGenerate.mockReturnValue({ success: true, plan: SAMPLE_PLAN });

    for (const token of ["student-token", "advisor-token", "admin-token"]) {
      const server = buildApiServer();
      const res = await request(server)
        .post("/api/schedule/generate")
        .set("Cookie", `session=${token}`)
        .set("Content-Type", "application/json")
        .send(MINIMAL_GENERATE_BODY);
      expect(res.status).toBe(200);
      await closeServer(server);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/student/[id]/progress — response shape
// ---------------------------------------------------------------------------

describe("GET /api/student/[id]/progress — response shape", () => {
  beforeEach(() => {
    mockProgress.mockReturnValue(SAMPLE_PROGRESS);
    mockItemFindMany.mockResolvedValue([]);
    mockReqFindMany.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  it("returns 200 with the GraduationProgress shape for an accessible student", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-123/progress")
      .set("Cookie", "session=student-token");

    expect(res.status).toBe(200);
    expect(typeof res.body.completedCredits).toBe("number");
    expect(typeof res.body.requiredCredits).toBe("number");
    expect(typeof res.body.percentComplete).toBe("number");
    expect(Array.isArray(res.body.remainingRequirements)).toBe(true);
    await closeServer(server);
  });

  it("requiredCredits is always 120", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-123/progress")
      .set("Cookie", "session=student-token");

    expect(res.body.requiredCredits).toBe(120);
    await closeServer(server);
  });

  it("each remainingRequirement has name (string), type (string), and met (boolean)", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-123/progress")
      .set("Cookie", "session=student-token");

    for (const req of res.body.remainingRequirements) {
      expect(typeof req.name).toBe("string");
      expect(typeof req.type).toBe("string");
      expect(typeof req.met).toBe("boolean");
    }
    await closeServer(server);
  });

  it("percentComplete equals completedCredits / 120 * 100", async () => {
    mockProgress.mockReturnValue({
      completedCredits: 60,
      requiredCredits: 120,
      percentComplete: 50,
      remainingRequirements: [],
    });

    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-123/progress")
      .set("Cookie", "session=student-token");

    expect(res.body.completedCredits).toBe(60);
    expect(res.body.percentComplete).toBeCloseTo(50);
    await closeServer(server);
  });

  it("completedCredits is 0 for a student with no completed courses", async () => {
    mockProgress.mockReturnValue({
      completedCredits: 0,
      requiredCredits: 120,
      percentComplete: 0,
      remainingRequirements: [],
    });

    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-123/progress")
      .set("Cookie", "session=student-token");

    expect(res.body.completedCredits).toBe(0);
    expect(res.body.percentComplete).toBe(0);
    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// GET /api/student/[id]/progress — auth enforcement
// ---------------------------------------------------------------------------

describe("GET /api/student/[id]/progress — auth enforcement", () => {
  beforeEach(() => {
    mockProgress.mockReturnValue(SAMPLE_PROGRESS);
    mockItemFindMany.mockResolvedValue([]);
    mockReqFindMany.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  it("returns 401 when no session cookie is present", async () => {
    const server = buildApiServer();
    const res = await request(server).get("/api/student/student-123/progress");
    expect(res.status).toBe(401);
    await closeServer(server);
  });

  it("returns 401 when the session token is invalid", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-123/progress")
      .set("Cookie", "session=bad-token");
    expect(res.status).toBe(401);
    await closeServer(server);
  });

  it("student can access their own progress (200)", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-123/progress")
      .set("Cookie", "session=student-token");
    expect(res.status).toBe(200);
    await closeServer(server);
  });

  it("student cannot access another student's progress (403)", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-999/progress")
      .set("Cookie", "session=student-token");
    expect(res.status).toBe(403);
    await closeServer(server);
  });

  it("advisor can access an assigned student's progress (200)", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-123/progress")
      .set("Cookie", "session=advisor-token");
    expect(res.status).toBe(200);
    await closeServer(server);
  });

  it("advisor cannot access an unassigned student's progress (403)", async () => {
    const server = buildApiServer();
    const res = await request(server)
      .get("/api/student/student-999/progress")
      .set("Cookie", "session=advisor-token");
    expect(res.status).toBe(403);
    await closeServer(server);
  });

  it("admin can access any student's progress (200)", async () => {
    const server = buildApiServer();
    // Both an unassigned student and an arbitrary ID must be accessible
    for (const id of ["student-123", "student-999", "some-other-student"]) {
      const res = await request(server)
        .get(`/api/student/${id}/progress`)
        .set("Cookie", "session=admin-token");
      expect(res.status).toBe(200);
    }
    await closeServer(server);
  });
});
