// file: lib/cache/keys.ts

/** TTL for cached validator results: 5 minutes. */
export const VALIDATOR_TTL_SECONDS = 300;

/** TTL for cached course-search results: 5 minutes. Course catalog changes rarely. */
export const SEARCH_TTL_SECONDS = 300;

export const CacheKeys = {
  validatorResult: (scheduleId: string) => `validator:${scheduleId}`,

  /**
   * Canonical cache key for a course-search request.
   * Params are sorted alphabetically so different orderings of the same
   * query (?a=1&b=2 vs ?b=2&a=1) map to the same entry.
   */
  searchResult: (searchParams: URLSearchParams): string => {
    const sorted = [...searchParams.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `search:${new URLSearchParams(sorted).toString()}`;
  },
} as const;
