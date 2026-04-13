// file: tests/health.test.ts

import request from "supertest";
import { createServer } from "http";
import { NextRequest } from "next/server";

// We import the route handler — it won't exist yet (TDD: failing first)
import { GET } from "@/app/api/health/route";

function buildTestServer() {
  return createServer(async (req, res) => {
    const url = `http://localhost${req.url}`;
    const nextReq = new NextRequest(url, { method: req.method ?? "GET" });
    const response = await GET(nextReq);
    const body = await response.json();
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
}

describe("GET /api/health", () => {
  it("returns 200 with { status: 'ok' }", async () => {
    const server = buildTestServer();
    const response = await request(server).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("responds with Content-Type application/json", async () => {
    const server = buildTestServer();
    const response = await request(server).get("/api/health");

    expect(response.headers["content-type"]).toMatch(/application\/json/);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("does not return a 404 or 500", async () => {
    const server = buildTestServer();
    const response = await request(server).get("/api/health");

    expect(response.status).not.toBe(404);
    expect(response.status).not.toBe(500);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
