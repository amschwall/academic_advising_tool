// file: tests/env.test.ts

/**
 * Tests for environment variable validation module: lib/env.ts
 * All required vars must be present; missing any should throw a typed,
 * descriptive error. No silent defaults or partial failures.
 */

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CLAUDE_API_KEY",
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

describe("Environment variable validation — lib/env.ts", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Snapshot the full env before each test
    originalEnv = Object.fromEntries(
      REQUIRED_ENV_VARS.map((key) => [key, process.env[key]])
    );
    jest.resetModules();
  });

  afterEach(() => {
    // Restore env exactly as it was
    for (const key of REQUIRED_ENV_VARS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    jest.resetModules();
  });

  it("does not throw when all required environment variables are present", async () => {
    // Ensure all required vars are set
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
    process.env.CLAUDE_API_KEY = "sk-ant-test-key";

    await expect(async () => {
      await import("@/lib/env");
    }).not.toThrow();
  });

  it("exports a validated env object with all required keys when vars are present", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
    process.env.CLAUDE_API_KEY = "sk-ant-test-key";

    const { env } = await import("@/lib/env");

    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/testdb");
    expect(env.SUPABASE_URL).toBe("https://test.supabase.co");
    expect(env.SUPABASE_ANON_KEY).toBe("test-anon-key");
    expect(env.CLAUDE_API_KEY).toBe("sk-ant-test-key");
  });

  for (const missingVar of REQUIRED_ENV_VARS) {
    it(`throws a descriptive error when ${missingVar} is missing`, async () => {
      // Set all vars, then remove the one under test
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
      process.env.SUPABASE_URL = "https://test.supabase.co";
      process.env.SUPABASE_ANON_KEY = "test-anon-key";
      process.env.CLAUDE_API_KEY = "sk-ant-test-key";
      delete process.env[missingVar];

      await expect(async () => {
        await import("@/lib/env");
      }).rejects.toThrow(new RegExp(missingVar));
    });

    it(`error message for missing ${missingVar} is descriptive (mentions the variable name)`, async () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
      process.env.SUPABASE_URL = "https://test.supabase.co";
      process.env.SUPABASE_ANON_KEY = "test-anon-key";
      process.env.CLAUDE_API_KEY = "sk-ant-test-key";
      delete process.env[missingVar];

      let thrownError: unknown;
      try {
        await import("@/lib/env");
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError).toBeInstanceOf(Error);
      expect((thrownError as Error).message).toMatch(missingVar);
    });
  }

  it("throws when multiple required variables are missing", async () => {
    // Remove all required vars
    for (const key of REQUIRED_ENV_VARS) {
      delete process.env[key];
    }

    await expect(async () => {
      await import("@/lib/env");
    }).rejects.toThrow();
  });

  it("does not silently fall back to a default value for any required variable", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
    delete process.env.CLAUDE_API_KEY;

    let thrownError: unknown;
    try {
      const mod = await import("@/lib/env");
      // If we reach here without throwing, the key must not have a fallback
      expect((mod.env as Record<string, unknown>).CLAUDE_API_KEY).not.toBe("");
      expect((mod.env as Record<string, unknown>).CLAUDE_API_KEY).not.toBe("undefined");
      expect((mod.env as Record<string, unknown>).CLAUDE_API_KEY).toBeUndefined();
    } catch (err) {
      thrownError = err;
    }

    // Either it threw (preferred) or it didn't silently inject a default
    if (thrownError) {
      expect((thrownError as Error).message).toMatch(/CLAUDE_API_KEY/);
    }
  });
});
