// file: lib/cost/tracker.ts
// Tracks cumulative Claude API spend across dev sessions.
// Writes to .cost-tracker.json at the project root (gitignored).

import fs   from "fs";
import path from "path";

const USAGE_FILE = path.join(process.cwd(), ".cost-tracker.json");

// claude-sonnet-4-6 pricing
const INPUT_COST_PER_TOKEN  = 3.00  / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15.00 / 1_000_000;

const MILESTONE_INTERVAL = 0.50; // dollars

interface UsageRecord {
  totalCostUsd:  number;
  lastMilestone: number; // highest 50-cent threshold crossed
  calls:         number;
}

function read(): UsageRecord {
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")) as UsageRecord;
  } catch {
    return { totalCostUsd: 0, lastMilestone: 0, calls: 0 };
  }
}

function write(r: UsageRecord): void {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(r, null, 2));
}

/**
 * Record token usage for one API call. Logs a warning to the console whenever
 * cumulative spend crosses another 50-cent milestone.
 */
export function recordUsage(inputTokens: number, outputTokens: number): void {
  const callCost = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
  const r = read();
  r.totalCostUsd += callCost;
  r.calls++;

  const milestone = Math.floor(r.totalCostUsd / MILESTONE_INTERVAL);
  if (milestone > r.lastMilestone) {
    r.lastMilestone = milestone;
    console.warn(
      `\n[COST] $${(milestone * MILESTONE_INTERVAL).toFixed(2)} milestone reached.` +
      ` Total: $${r.totalCostUsd.toFixed(4)} across ${r.calls} API calls.\n`
    );
  }

  write(r);
}

export function getTotalCost(): { usd: number; calls: number } {
  const r = read();
  return { usd: r.totalCostUsd, calls: r.calls };
}
