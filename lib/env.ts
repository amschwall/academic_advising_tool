// file: lib/env.ts

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CLAUDE_API_KEY",
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];
type ValidatedEnv = Record<RequiredEnvVar, string>;

function validateEnv(): ValidatedEnv {
  const missing: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Please ensure all required variables are set before starting the application.`
    );
  }

  return Object.fromEntries(
    REQUIRED_ENV_VARS.map((key) => [key, process.env[key] as string])
  ) as ValidatedEnv;
}

export const env = validateEnv();
