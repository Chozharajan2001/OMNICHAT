// src/lib/constants.ts
// Application-wide constants.
//
// Only values with more than one caller belong here. Rate-limit thresholds,
// password rules, token-estimation factors and cache TTLs each live next to the
// code that enforces them (src/lib/rate-limit.ts, src/lib/auth/email-policy.ts,
// src/lib/context-manager.ts, src/lib/cache.ts): a second copy in this file
// drifted silently and was deleted rather than kept as decoration.

// ────────────────────────────────────────────────────────────────
// Preferences
// ────────────────────────────────────────────────────────────────

/**
 * Applied by the server when a user saves preferences for the first time, and
 * used by the client to render the form for an account that has never saved
 * (GET /api/preferences legitimately returns { preferences: null } then).
 * Shared so the two can never disagree; lives here rather than in the query
 * module because the query module imports Prisma and must not reach a bundle.
 */
export const DEFAULT_USER_PREFERENCES = {
    defaultProviderId: "openai",
    defaultModelId: "gpt-4o",
    defaultSystemPrompt: "You are a helpful assistant.",
    theme: "dark",
    sendWithEnter: true,
    showTokenCount: false,
} as const;

// The empty-state greeting. It was duplicated as a literal in two places, so an
// empty welcome message was silently rewritten to this sentence at save time
// instead of being treated as the display fallback it actually is.
export const DEFAULT_WELCOME_MESSAGE = "What do you want to build, compare, or figure out today?";

// ────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────
// Chat requests
// ────────────────────────────────────────────────────────────────

/**
 * Ceiling on the message array of one chat request. Shared by the schema that
 * enforces it and the client that builds a private transcript, so the two cannot
 * disagree about when a request starts dying.
 */
export const CHAT_MAX_REQUEST_MESSAGES = 100;

/**
 * Separates an appended stream failure from the answer that precedes it.
 * Both ends read this from one place: the route writes it, the client strips
 * it before the text becomes assistant history.
 */
export const STREAM_ERROR_MARKER = "[[omnichat:stream-error]]";

// ────────────────────────────────────────────────────────────────
// API key validation
// ────────────────────────────────────────────────────────────────

/**
 * Confirming a credential costs a real completion, so both its time and its
 * output are bounded: the call previously had neither, meaning a stalled
 * provider held a request open indefinitely and "Say 'ok'" was free to answer
 * with a paragraph on the user's bill.
 */
export const KEY_VALIDATION_TIMEOUT_MS = 15_000;
export const KEY_VALIDATION_MAX_TOKENS = 8;

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

/** Default message page: a thread opens on its latest turns, older ones load on demand */
export const DEFAULT_MESSAGE_PAGE_SIZE = 20;
