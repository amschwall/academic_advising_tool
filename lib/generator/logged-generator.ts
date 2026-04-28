// file: lib/generator/logged-generator.ts
import { generateSchedule } from "@/lib/generator/generator";
import { logger } from "@/lib/logger";
import type { GeneratorInput, GeneratorResult } from "@/lib/generator/types";

const SERVICE = "schedule-generator";

/**
 * Thin wrapper around the pure generateSchedule function that emits
 * structured logs and metrics without modifying the generator itself.
 *
 * Always emits:
 *   metric  "schedule_generation_time"   — { studentId, durationMs }
 *
 * On failure also emits:
 *   error   "schedule_generation_failed" — { studentId, errors }
 */
export function loggedGenerateSchedule(input: GeneratorInput): GeneratorResult {
  const start = Date.now();
  const result = generateSchedule(input);
  const durationMs = Date.now() - start;

  logger.metric(SERVICE, "schedule_generation_time", {
    studentId: input.student.id,
    durationMs,
  });

  if (!result.success) {
    logger.error(SERVICE, "schedule_generation_failed", {
      studentId: input.student.id,
      errors: result.errors ?? [],
    });
  }

  return result;
}
