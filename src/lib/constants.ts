// src/lib/constants.ts
// Application-wide constants.
//
// Only values with more than one caller belong here. Rate-limit thresholds,
// password rules, token-estimation factors and cache TTLs each live next to the
// code that enforces them (src/lib/rate-limit.ts, src/lib/auth/email-policy.ts,
// src/lib/context-manager.ts, src/lib/cache.ts): a second copy in this file
// drifted silently and was deleted rather than kept as decoration.

// ────────────────────────────────────────────────────────────────
// Rate Limiting
// ────────────────────────────────────────────────────────────────

/** Write operations: 30 requests per minute */
export const WRITE_RATE_LIMIT = 30;
export const WRITE_RATE_WINDOW_MS = 60_000;

// ────────────────────────────────────────────────────────────────
// Pagination
// ────────────────────────────────────────────────────────────────

/** Default page size for list endpoints */
export const DEFAULT_PAGE_SIZE = 50;

/** Maximum page size */
export const MAX_PAGE_SIZE = 100;

/** Minimum page size */
export const MIN_PAGE_SIZE = 1;
