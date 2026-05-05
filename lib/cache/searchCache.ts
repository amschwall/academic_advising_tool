// file: lib/cache/searchCache.ts
// Singleton search-result cache, shared between the route handler and tests.
import { InMemoryCache } from "./memory";

export const searchCache = new InMemoryCache();
