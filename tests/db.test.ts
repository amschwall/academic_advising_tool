// file: tests/db.test.ts

/**
 * Tests for lib/db.ts — Prisma client initialization and database connectivity.
 * pg and @prisma/client are mocked so the suite runs without a live database.
 * The isolation-check tests simulate BEGIN/ROLLBACK state via the pg mock.
 */

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ result: 2 }]),
  })),
}));

jest.mock("pg", () => {
  // Shared state that simulates a single Postgres transaction's visibility.
  // ROLLBACK resets it; INSERT increments it; SELECT reads it.
  let isolationRows = 0;

  const query = jest.fn(async (sql: string) => {
    const s = sql.trim();
    if (s === "BEGIN") return { rowCount: 0, rows: [] };
    if (s === "ROLLBACK") {
      isolationRows = 0;
      return { rowCount: 0, rows: [] };
    }
    if (/CREATE TEMP TABLE/i.test(s)) return { rowCount: 0, rows: [] };
    if (/INSERT INTO _isolation_check/i.test(s)) {
      isolationRows++;
      return { rowCount: 1, rows: [{ id: isolationRows, label: "test-sentinel" }] };
    }
    if (/SELECT .* FROM _isolation_check/i.test(s)) {
      return {
        rowCount: isolationRows,
        rows: Array.from({ length: isolationRows }, (_, i) => ({
          id: i + 1,
          label: "test-sentinel",
        })),
      };
    }
    return { rowCount: 0, rows: [] };
  });

  return {
    Client: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined),
      query,
    })),
  };
});

import { Client } from "pg";
import { prisma } from "@/lib/db";

describe("Database connectivity", () => {
  let client: InstanceType<typeof Client>;

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
    await client.query(`
      CREATE TEMP TABLE IF NOT EXISTS _isolation_check (id SERIAL, label TEXT)
    `);
    await client.query(`INSERT INTO _isolation_check (label) VALUES ('test-sentinel')`);

    const res = await client.query(`SELECT * FROM _isolation_check WHERE label = 'test-sentinel'`);
    expect(res.rowCount).toBe(1);
    // ROLLBACK in afterEach resets isolationRows to 0
  });

  it("rolls back inserted data after each test (isolation check — part 2: verify clean slate)", async () => {
    await client.query(`
      CREATE TEMP TABLE IF NOT EXISTS _isolation_check (id SERIAL, label TEXT)
    `);
    const res = await client.query(`SELECT * FROM _isolation_check WHERE label = 'test-sentinel'`);
    // Row from part 1 must not be visible — the mock ROLLBACK cleared isolationRows
    expect(res.rowCount).toBe(0);
  });
});

describe("Database connectivity — missing DATABASE_URL", () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    jest.resetModules();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    jest.resetModules();
  });

  it("throws a descriptive error when DATABASE_URL is missing", async () => {
    await expect(async () => {
      const { prisma: freshPrisma } = await import("@/lib/db");
      await freshPrisma.$connect();
    }).rejects.toThrow(/DATABASE_URL/);
  });
});
