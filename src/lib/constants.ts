// src/lib/constants.ts
// Application-wide constants

// ────────────────────────────────────────────────────────────────
// Validation Limits
// ────────────────────────────────────────────────────────────────

/** Maximum length for message content (100KB) */
export const MAX_MESSAGE_CONTENT_LENGTH = 100000;

/** Maximum number of messages in a single request */
export const MAX_MESSAGES_PER_REQUEST = 100;

/** Maximum length for conversation titles */
export const MAX_TITLE_LENGTH = 200;

/** Maximum length for project names */
export const MAX_PROJECT_NAME_LENGTH = 100;

/** Maximum length for system prompts (10KB) */
export const MAX_SYSTEM_PROMPT_LENGTH = 10000;

// ────────────────────────────────────────────────────────────────
// Rate Limiting
// ────────────────────────────────────────────────────────────────

/** Chat API: 60 requests per minute */
export const CHAT_RATE_LIMIT = 60;
export const CHAT_RATE_WINDOW_MS = 60_000;

/** API key validation: 10 requests per minute */
export const API_KEY_RATE_LIMIT = 10;
export const API_KEY_RATE_WINDOW_MS = 60_000;

/** Authentication: 5 attempts per 15 minutes */
export const AUTH_RATE_LIMIT = 5;
export const AUTH_RATE_WINDOW_MS = 15 * 60_000;

/** Write operations: 30 requests per minute */
export const WRITE_RATE_LIMIT = 30;
export const WRITE_RATE_WINDOW_MS = 60_000;

/** Delete operations: 5 requests per minute */
export const DELETE_RATE_LIMIT = 5;
export const DELETE_RATE_WINDOW_MS = 60_000;

// ────────────────────────────────────────────────────────────────
// Pagination
// ────────────────────────────────────────────────────────────────

/** Default page size for list endpoints */
export const DEFAULT_PAGE_SIZE = 50;

/** Maximum page size */
export const MAX_PAGE_SIZE = 100;

/** Minimum page size */
export const MIN_PAGE_SIZE = 1;

// ────────────────────────────────────────────────────────────────
// Context Window
// ────────────────────────────────────────────────────────────────

/** Percentage of context window to reserve for response (25%) */
export const CONTEXT_RESPONSE_RESERVE_PERCENT = 0.25;

/** Default context window size if model not found (128K tokens) */
export const DEFAULT_CONTEXT_WINDOW = 128000;

/** Average characters per token for estimation */
export const CHARS_PER_TOKEN = 4;

// ────────────────────────────────────────────────────────────────
// Rate Limiter Store
// ────────────────────────────────────────────────────────────────

/** Maximum number of entries in rate limiter store before LRU eviction */
export const RATE_LIMITER_MAX_STORE_SIZE = 10000;

/** Cleanup interval for expired entries (1 minute) */
export const RATE_LIMITER_CLEANUP_INTERVAL_MS = 60_000;

// ────────────────────────────────────────────────────────────────
// Password Requirements
// ────────────────────────────────────────────────────────────────

/** Minimum password length */
export const MIN_PASSWORD_LENGTH = 8;

/** Require at least one uppercase letter */
export const REQUIRE_UPPERCASE = true;

/** Require at least one lowercase letter */
export const REQUIRE_LOWERCASE = true;

/** Require at least one number */
export const REQUIRE_NUMBER = true;

// ────────────────────────────────────────────────────────────────
// Caching
// ────────────────────────────────────────────────────────────────

/** User preferences cache TTL (30 seconds) */
export const PREFERENCES_CACHE_TTL_MS = 30_000;

/** Provider list cache TTL (5 minutes - relatively static) */
export const PROVIDERS_CACHE_TTL_MS = 5 * 60_000;

// ────────────────────────────────────────────────────────────────
// Database
// ────────────────────────────────────────────────────────────────

/** Maximum concurrent database connections */
export const MAX_DB_CONNECTIONS = 10;

/** Query timeout in milliseconds */
export const DB_QUERY_TIMEOUT_MS = 30_000;

// ────────────────────────────────────────────────────────────────
// API
// ────────────────────────────────────────────────────────────────

/** Current API version */
export const API_VERSION = "v1";

/** API base path */
export const API_BASE_PATH = `/api/${API_VERSION}`;
