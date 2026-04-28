// file: tests/auth.test.ts

/**
 * Phase 2 — Authentication (SSO Simulation)
 *
 * Simulates university SSO via Supabase OAuth-style token exchange.
 * @supabase/supabase-js is mocked so no real Supabase project is required.
 *
 * Routes under test (TDD — these will fail until Phase 2 is implemented):
 *   POST /api/auth/login   — exchange a Supabase access token for a session cookie
 *   POST /api/auth/logout  — clear the session cookie
 *   GET  /api/auth/session — return the current user from the session, or 401
 */

import request from "supertest";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Supabase mock — must be declared before any route-handler imports
// ---------------------------------------------------------------------------

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async (token: string) => {
        if (token === "valid-sso-token") {
          return {
            data: {
              user: {
                id: "user-abc123",
                email: "sparky@wm.edu",
                user_metadata: { name: "Sparky Student", role: "student" },
              },
            },
            error: null,
          };
        }
        return {
          data: { user: null },
          error: { message: "Invalid or expired token", status: 401 },
        };
      }),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Route handler imports — will throw "Cannot find module" until Phase 2
// is implemented. That is intentional: tests are written first (TDD).
// ---------------------------------------------------------------------------

import { POST as loginHandler } from "@/app/api/auth/login/route";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { GET as sessionHandler } from "@/app/api/auth/session/route";

// ---------------------------------------------------------------------------
// Test-server helpers
// ---------------------------------------------------------------------------

/** Drain an IncomingMessage body into a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
  });
}

/**
 * Builds an in-memory HTTP server that dispatches to the three auth route
 * handlers and correctly forwards cookies in both directions so that
 * supertest.agent() can maintain session state across requests.
 */
function buildAuthServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = `http://localhost${req.url}`;
    const method = (req.method ?? "GET").toUpperCase();
    const body = await readBody(req);

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

    if (url.includes("/api/auth/login") && method === "POST") {
      response = await loginHandler(nextReq);
    } else if (url.includes("/api/auth/logout") && method === "POST") {
      response = await logoutHandler(nextReq);
    } else if (url.includes("/api/auth/session") && method === "GET") {
      response = await sessionHandler(nextReq);
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const responseBody = await response.json();
    const outHeaders: Record<string, string | string[]> = {
      "content-type": "application/json",
    };

    // Forward Set-Cookie so supertest.agent() persists the session cookie
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) outHeaders["set-cookie"] = setCookie;

    res.writeHead(response.status, outHeaders);
    res.end(JSON.stringify(responseBody));
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  it("returns 200 and sets a session cookie when given a valid SSO token", async () => {
    const server = buildAuthServer();

    const res = await request(server)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ token: "valid-sso-token" });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("sparky@wm.edu");
    // A session cookie must be set so subsequent requests can be authenticated
    expect(res.headers["set-cookie"]).toBeDefined();

    await closeServer(server);
  });

  it("returns 401 when the SSO token is invalid or expired", async () => {
    const server = buildAuthServer();

    const res = await request(server)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ token: "not-a-real-token" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.user).toBeUndefined();
    // No session cookie should be issued on a failed login
    expect(res.headers["set-cookie"]).toBeUndefined();

    await closeServer(server);
  });

  it("returns 400 when the request body contains no token field", async () => {
    const server = buildAuthServer();

    const res = await request(server)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();

    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/session
// ---------------------------------------------------------------------------

describe("GET /api/auth/session", () => {
  it("returns 401 when no session cookie is present", async () => {
    const server = buildAuthServer();

    const res = await request(server).get("/api/auth/session");

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();

    await closeServer(server);
  });

  it("returns 200 and the current user when a valid session cookie is present", async () => {
    const server = buildAuthServer();
    const agent = request.agent(server);

    // Establish a session first
    await agent
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ token: "valid-sso-token" });

    const res = await agent.get("/api/auth/session");

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("sparky@wm.edu");

    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// Session persistence across requests
// ---------------------------------------------------------------------------

describe("Session persistence", () => {
  it("session cookie is accepted across multiple successive requests", async () => {
    const server = buildAuthServer();
    const agent = request.agent(server);

    const loginRes = await agent
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ token: "valid-sso-token" });
    expect(loginRes.status).toBe(200);

    // First subsequent request
    const first = await agent.get("/api/auth/session");
    expect(first.status).toBe(200);

    // Second subsequent request — cookie must still be valid
    const second = await agent.get("/api/auth/session");
    expect(second.status).toBe(200);
    expect(second.body.user.email).toBe("sparky@wm.edu");

    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("returns 200 and invalidates the session (subsequent GET /session → 401)", async () => {
    const server = buildAuthServer();
    const agent = request.agent(server);

    // Login
    const loginRes = await agent
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({ token: "valid-sso-token" });
    expect(loginRes.status).toBe(200);

    // Confirm session is active
    const before = await agent.get("/api/auth/session");
    expect(before.status).toBe(200);

    // Logout
    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);

    // Session must no longer be valid
    const after = await agent.get("/api/auth/session");
    expect(after.status).toBe(401);

    await closeServer(server);
  });

  it("returns 200 even when called without an active session (idempotent)", async () => {
    const server = buildAuthServer();

    const res = await request(server).post("/api/auth/logout");
    expect(res.status).toBe(200);

    await closeServer(server);
  });
});

// ---------------------------------------------------------------------------
// Unauthorized access
// ---------------------------------------------------------------------------

describe("Unauthorized access", () => {
  it("GET /api/auth/session without credentials returns 401, not 404 or 500", async () => {
    const server = buildAuthServer();

    const res = await request(server).get("/api/auth/session");

    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);

    await closeServer(server);
  });

  it("401 response body contains a non-empty error string", async () => {
    const server = buildAuthServer();

    const res = await request(server).get("/api/auth/session");

    expect(res.body).toHaveProperty("error");
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);

    await closeServer(server);
  });
});
