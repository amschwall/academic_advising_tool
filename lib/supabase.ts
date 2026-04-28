// file: lib/supabase.ts

import { createClient } from "@supabase/supabase-js";

// These must be NEXT_PUBLIC_ so Next.js bundles them into the client-side build.
// Server-side code that needs validated env vars should import from lib/env.ts directly.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
