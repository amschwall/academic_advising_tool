// file: lib/cache/validator-cache.ts

import type { Cache } from "./cache";
import type { ValidationResult } from "../validator/types";
import { CacheKeys, VALIDATOR_TTL_SECONDS } from "./keys";

/**
 * Returns the cached ValidationResult for `scheduleId` if present and
 * unexpired; otherwise calls `compute`, stores the result, and returns it.
 */
export async function getOrComputeValidationResult(
  cache: Cache,
  scheduleId: string,
  compute: () => Promise<ValidationResult>
): Promise<ValidationResult> {
  const key = CacheKeys.validatorResult(scheduleId);
  const cached = await cache.get<ValidationResult>(key);
  if (cached !== null) return cached;

  const result = await compute();
  await cache.set(key, result, VALIDATOR_TTL_SECONDS);
  return result;
}

/**
 * Removes the cached ValidationResult for `scheduleId`, forcing the next
 * call to `getOrComputeValidationResult` to recompute.
 */
export async function invalidateValidationResult(
  cache: Cache,
  scheduleId: string
): Promise<void> {
  await cache.delete(CacheKeys.validatorResult(scheduleId));
}
