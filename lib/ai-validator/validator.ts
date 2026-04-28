// file: lib/ai-validator/validator.ts

import { validateSchedule } from "../validator/validator";
import { logger } from "@/lib/logger";
import type {
  FullScheduleInput,
  ValidationError,
  ValidationResult,
} from "../validator/types";

/**
 * Validates a schedule produced by the AI generator.
 *
 * Runs two passes:
 *   1. Check every scheduled course code exists in the provided courses catalog.
 *      Unknown codes produce INVALID_COURSE errors immediately.
 *   2. Delegate to Phase 6's validateSchedule for credit limits, prerequisites,
 *      COLL requirements, major requirements, and time conflicts.
 *
 * Never auto-corrects: input is never mutated and errors are always returned
 * as-is rather than silently fixed.
 */
export function validateAISchedule(input: FullScheduleInput): ValidationResult {
  const errors: ValidationError[] = [];

  // ── 1. Course existence check ─────────────────────────────────────────────
  // Only flag future (non-completed) items. Completed items represent historical
  // enrollments that were valid when taken — they must not be penalised even if
  // the course has since been removed from the catalog.

  for (const item of input.items) {
    if (!item.completed && !input.courses[item.courseCode]) {
      errors.push({
        type: "INVALID_COURSE",
        message: `Course "${item.courseCode}" does not exist in the course catalog`,
        courseCode: item.courseCode,
      });
    }
  }

  // ── 2. Phase 6 schedule validation ───────────────────────────────────────

  const phase6Result = validateSchedule(input);
  errors.push(...phase6Result.errors);

  const result: ValidationResult = { valid: errors.length === 0, errors };

  if (!result.valid) {
    logger.error("ai-validator", "ai_validation_failed", {
      errorCount: errors.length,
      errors: errors.map((e) => ({
        type:       e.type,
        message:    e.message,
        courseCode: e.courseCode,
      })),
    });
  }

  return result;
}
