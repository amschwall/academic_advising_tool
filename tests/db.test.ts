// file: tests/db.test.ts

import { Client } from "pg";

/**
 * These tests verify that Prisma can connect to the Postgres test DB,
 * and that each test is wrapped in a transaction that rolls back,
 * ensuring full isolation.
 *
 * We import the Prisma client from lib/db.ts — does not exist yet (TDD).
 */
import { prisma } from "@/lib/db";

describe("Database connectivity", () => {
  let client: Client;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL is not set in test environment");

    client = new Client({ connectionString: dbUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await client.query("BEGIN");
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  it("connects to the Postgres test database without throwing", async () => {
    await expect(prisma.$connect()).resolves.not.toThrow();
  });

  it("can execute a raw query against the test database", async () => {
    const result = await prisma.$queryRaw<[{ result: number }]>`SELECT 1 + 1 AS result`;
    expect(result[0].result).toBe(2);
  });

  it("rolls back inserted data after each test (isolation check — part 1: insert)", async () => {
    // Insert a sentinel row into a known-safe temp table for isolation verification
    await client.query(`
      CREATE TEMP TABLE IF NOT EXISTS _isolation_check (id SERIAL, label TEXT)
    `);
    await client.query(`INSERT INTO _isolation_check (label) VALUES ('test-sentinel')`);

    const res = await client.query(`SELECT * FROM _isolation_check WHERE label = 'test-sentinel'`);
    expect(res.rowCount).toBe(1);
    // ROLLBACK in afterEach will undo this insert
  });

  it("rolls back inserted data after each test (isolation check — part 2: verify clean slate)", async () => {
    await client.query(`
      CREATE TEMP TABLE IF NOT EXISTS _isolation_check (id SERIAL, label TEXT)
    `);
    const res = await client.query(`SELECT * FROM _isolation_check WHERE label = 'test-sentinel'`);
    // Row from part 1 must not be visible here — transaction was rolled back
    expect(res.rowCount).toBe(0);
  });
});

describe("Database connectivity — missing DATABASE_URL", () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    // Clear the module registry so lib/db.ts re-evaluates without DATABASE_URL
    jest.resetModules();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    jest.resetModules();
  });

  it("throws a descriptive error when DATABASE_URL is missing", async () => {
    await expect(async () => {
      // Re-require after resetting modules so the missing env var is observed
      const { prisma: freshPrisma } = await import("@/lib/db");
      await freshPrisma.$connect();
    }).rejects.toThrow(/DATABASE_URL/);
  });
});
