// file: tests/authorization.test.ts

/**
 * Phase 3 — Authorization & Roles
 *
 * Tests for role-based access control (RBAC) across three roles:
 *   student  — may only read their own data
 *   advisor  — may read data for students assigned to them
 *   admin    — may read all data
 *
 * Session tokens used throughout:
 *   "student-token"  → student-123  (role: student)
 *   "advisor-token"  → advisor-456  (role: advisor, assignedStudents: [student-123])
 *   "admin-token"    → admin-789    (role: admin)
 *   "bad-token"      → rejected by Supabase (triggers 401)
 *
 * Routes under test (TDD — not yet implemented):
 *   GET /api/student/:id   — student data; access controlled by RBAC
 *   GET /api/admin/users   — all users; admin only
 *
 * Middleware under test (TDD — not yet implemented):
 *   lib/middleware/withRole.ts — wraps handlers with session + role checks
 */

import request from "supertest";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Supabase mock — role-aware; must be declared before any route imports
// ---------------------------------------------------------------------------

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async (token: string) => {
        const users: Record<string, object> = {
          "student-token": {
            id: "student-123",
            email: "student@wm.edu",
            user_metadata: { name: "Sam Student", role: "student" },
          },
          "advisor-token": {
            id: "advisor-456",
            email: "advisor@wm.edu",
            user_metadata: {
              name: "Ada Advisor",
              role: "advisor",
              assignedStudents: ["student-123"],
            },
          },
          "admin-token": {
            id: "admin-789",
            email: "admin@wm.edu",
            user_metadata: { name: "Alex Admin", role: "admin" },
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

// ---------------------------------------------------------------------------
// Route + middleware imports (will fail until Phase 3 is implemented — TDD)
// ---------------------------------------------------------------------------

import { GET as getStudentHandler } from "@/app/api/student/[id]/route";
import { GET as getAdminUsersHandler } from "@/app/api/admin/users/route";
import { withRole } from "@/lib/middleware/withRole";

// ---------------------------------------------------------------------------
// Test-server helpers
// ---------------------------------------------------------------------------

/**
 * Builds a test server that routes to the two protected handlers.
 * The session token is injected directly via the Cookie header — no login
 * flow needed, keeping these tests focused purely on authorization logic.
 */
function buildAuthzServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = `http://localhost${req.url ?? "/"}`;
    const method = (req.method ?? "GET").toUpperCase();

    const initHeaders: Record<string, string> = {};
    if (req.headers.cookie) initHeaders["cookie"] = req.headers.cookie;

    const nextReq = new NextRequest(url, { method, headers: initHeaders });

    let response: Response;

    const studentMatch = req.url?.match(/^\/api\/student\/([^/]+)$/);
    if (studentMatch && method === "GET") {
      const id = studentMatch[1];
      response = await getStudentHandler(nextReq, { params: { id } });
    } else if (req.url === "/api/admin/users" && method === "GET") {
      response = await getAdminUsersHandler(nextReq);
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const body = await response.json();
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Build a NextRequest with a pre-set session cookie. */
function makeReq(url: string, token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["cookie"] = `session=${token}`;
  return new NextRequest(`http://localhost${url}`, { headers });
}

// ---------------------------------------------------------------------------
// withRole middleware — unit tests
// ---------------------------------------------------------------------------

describe("withRole middleware", () => {
  const mockHandler = jest.fn().mockResolvedValue(
    NextResponse.json({ data: "protected" }, { status: 200 })
  );

  beforeEach(() => mockHandler.mockClear());

  it("calls the wrapped handler when session is valid and role is permitted", async () => {
    const protected_ = withRole(["student"])(mockHandler);
    const res = await protected_(makeReq("/api/student/student-123", "student-token"));

    expect(res.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when no session cookie is present", async () => {
    const protected_ = withRole(["student"])(mockHandler);
    const res = await protected_(makeReq("/api/student/student-123"));

    expect(res.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("returns 401 when the session token is invalid or expired", async () => {
    const protected_ = withRole(["student"])(mockHandler);
    const res = await protected_(makeReq("/api/student/student-123", "bad-token"));

    expect(res.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("returns 403 when the user's role is not in the allowed list", async () => {
    const protected_ = withRole(["admin"])(mockHandler);
    const res = await protected_(makeReq("/api/admin/users", "student-token"));

    expect(res.status).toBe(403);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("permits access when the user holds any one of multiple allowed roles", async () => {
    const protected_ = withRole(["advisor", "admin"])(mockHandler);

    const advisorRes = await protected_(makeReq("/api/student/student-123", "advisor-token"));
    expect(advisorRes.status).toBe(200);

    const adminRes = await protected_(makeReq("/api/student/student-123", "admin-token"));
    expect(adminRes.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Student access — GET /api/student/:id
// ---------------------------------------------------------------------------

describe("Student access — GET /api/student/:id", () => {
  it("student can access their own data (200)", async () => {
    const server = buildAuthzServer();

    const res = await request(server)
      .get("/api/student/student-123")
      .set("Cookie", "session=student-token");

    expect(res.status).toBe(200);
    expect(res.body.student).toBeDefined();

    await closeServer(server);
  });

  it("student cannot access another student's data (403)", async () => {
    const server = buildAuthzServer();

    const res = await request(server)
      .get("/api/student/student-999")
      .set("Cookie", "session=student-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// Advisor access — GET /api/student/:id
// ---------------------------------------------------------------------------

describe("Advisor access — GET /api/student/:id", () => {
  it("advisor can access an assigned student's data (200)", async () => {
    const server = buildAuthzServer();

    const res = await request(server)
      .get("/api/student/student-123")
      .set("Cookie", "session=advisor-token");

    expect(res.status).toBe(200);
    expect(res.body.student).toBeDefined();

    await closeServer(server);
  });

  it("advisor cannot access an unassigned student's data (403)", async () => {
    const server = buildAuthzServer();

    const res = await request(server)
      .get("/api/student/student-999")
      .set("Cookie", "session=advisor-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// Admin access — GET /api/student/:id
// ---------------------------------------------------------------------------

describe("Admin access — GET /api/student/:id", () => {
  it("admin can access any student's data (200)", async () => {
    const server = buildAuthzServer();

    const assignedRes = await request(server)
      .get("/api/student/student-123")
      .set("Cookie", "session=admin-token");
    expect(assignedRes.status).toBe(200);

    const arbitraryRes = await request(server)
      .get("/api/student/student-999")
      .set("Cookie", "session=admin-token");
    expect(arbitraryRes.status).toBe(200);

    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// Admin-only route — GET /api/admin/users
// ---------------------------------------------------------------------------

describe("Admin-only route — GET /api/admin/users", () => {
  it("admin can access the admin users list (200)", async () => {
    const server = buildAuthzServer();

    const res = await request(server)
      .get("/api/admin/users")
      .set("Cookie", "session=admin-token");

    expect(res.status).toBe(200);
    expect(res.body.users).toBeDefined();

    await closeServer(server);
  });

  it("student is rejected from the admin route (403)", async () => {
    const server = buildAuthzServer();

    const res = await request(server)
      .get("/api/admin/users")
      .set("Cookie", "session=student-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    await closeServer(server);
  });

  it("advisor is rejected from the admin route (403)", async () => {
    const server = buildAuthzServer();

    const res = await request(server)
      .get("/api/admin/users")
      .set("Cookie", "session=advisor-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();

    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------

describe("Unauthenticated access", () => {
  it("request with no session cookie returns 401", async () => {
    const server = buildAuthzServer();

    const res = await request(server).get("/api/student/student-123");

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();

    await closeServer(server);
  });

  it("request with an invalid session token returns 401", async () => {
    const server = buildAuthzServer();

    const res = await request(server)
      .get("/api/student/student-123")
      .set("Cookie", "session=bad-token");

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();

    await closeServer(server);
  });
});
