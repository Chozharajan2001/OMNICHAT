import { createRedisRestBackend, resolveRateLimitBackend } from "./rate-limit-redis-rest";

export {
  RateLimitBackendUnavailableError,
  isRateLimitBackendUnavailableError,
  type RateLimitBackendFailure,
} from "./rate-limit-redis-rest";

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastAccessed: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  // Use a stable namespace (e.g., auth:identifier) shared by every worker.
  keyGenerator?: (identifier: string) => string;
  maxStoreSize?: number; // Memory mode only (default: 10000)
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetTime: number; // Absolute Unix time in milliseconds
  retryAfter: number; // Whole seconds, rounded up
}

export interface RateLimiter {
  check(identifier: string): Promise<RateLimitResult>;
  reset(identifier: string): Promise<void>;
}

// Explicit local mode retains the shared process-local store and LRU behavior.
// Expiration is lazy and capacity bounded; no background timers survive reloads.
const store = new Map<string, RateLimitEntry>();
const DEFAULT_MAX_STORE_SIZE = 10000;

function evictOldestEntry(maxStoreSize: number): void {
  if (store.size < maxStoreSize) return;

  const now = Date.now();
  let oldestKey: string | null = null;
  let oldestAccessTime = Infinity;

  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key);
      if (store.size < maxStoreSize) return;
    }
  }

  for (const [key, entry] of store.entries()) {
    if (entry.lastAccessed < oldestAccessTime) {
      oldestAccessTime = entry.lastAccessed;
      oldestKey = key;
    }
  }

  if (oldestKey !== null) store.delete(oldestKey);
}

/**
 * Synchronous factory, asynchronous operations. Each instance snapshots valid
 * backend configuration on its first check/reset; imports do not connect to Redis.
 * Both operations reject with RateLimitBackendUnavailableError on backend failure.
 * No Redis failure ever falls back to the local store. Restart after config changes.
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const { windowMs, maxRequests, keyGenerator, maxStoreSize = DEFAULT_MAX_STORE_SIZE } = config;
  for (const [name, value] of Object.entries({ windowMs, maxRequests, maxStoreSize })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
  if (windowMs > 2_147_483_647) {
    throw new RangeError("windowMs must not exceed 2147483647 milliseconds");
  }

  let backend: { kind: "memory" } | {
    kind: "redis-rest";
    client: ReturnType<typeof createRedisRestBackend>;
  } | undefined;

  function getBackend() {
    if (!backend) {
      const resolved = resolveRateLimitBackend();
      backend = resolved.backend === "memory"
        ? { kind: "memory" }
        : { kind: "redis-rest", client: createRedisRestBackend(resolved) };
    }
    return backend;
  }

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      const selected = getBackend();
      const key = keyGenerator ? keyGenerator(identifier) : identifier;
      if (selected.kind === "redis-rest") {
        const { count, ttlMs, resetTime } = await selected.client.check(key, windowMs);
        const limited = count > maxRequests;
        return {
          limited,
          remaining: Math.max(0, maxRequests - count),
          resetTime,
          retryAfter: limited ? Math.max(1, Math.ceil(ttlMs / 1000)) : 0,
        };
      }

      const now = Date.now();
      const entry = store.get(key);
      if (!entry && store.size >= maxStoreSize) evictOldestEntry(maxStoreSize);

      if (!entry || entry.resetTime < now) {
        const resetTime = now + windowMs;
        store.set(key, { count: 1, resetTime, lastAccessed: now });
        return { limited: false, remaining: maxRequests - 1, resetTime, retryAfter: 0 };
      }

      entry.lastAccessed = now;
      if (entry.count >= maxRequests) {
        return {
          limited: true,
          remaining: 0,
          resetTime: entry.resetTime,
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        };
      }

      entry.count++;
      return {
        limited: false,
        remaining: maxRequests - entry.count,
        resetTime: entry.resetTime,
        retryAfter: 0,
      };
    },

    async reset(identifier: string): Promise<void> {
      const selected = getBackend();
      const key = keyGenerator ? keyGenerator(identifier) : identifier;
      if (selected.kind === "redis-rest") {
        await selected.client.reset(key);
      } else {
        store.delete(key);
      }
    },
  };
}

/**
 * Rate limiter for chat API
 * 60 requests per minute per user
 */
export const chatRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 60,
  keyGenerator: (userId) => `chat:${userId}`,
});

/**
 * Rate limiter for API key validation
 * 10 requests per minute per user
 */
/** Requests per minute for API-key save and re-validate; also the limit the 429 headers report. */
export const API_KEY_RATE_LIMIT = 10;

export const apiKeyRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: API_KEY_RATE_LIMIT,
  keyGenerator: (userId) => `api-key:${userId}`,
});

/**
 * Rate limiter for authentication attempts
 * 5 attempts per 15 minutes per IP
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60_000, // 15 minutes
  maxRequests: 5,
  keyGenerator: (ip) => `auth:${ip}`,
});

/**
 * Get client IP from request headers.
 * 
 * SECURITY: Trusts X-Real-IP over X-Forwarded-For to prevent IP spoofing.
 * When deploying behind a reverse proxy, ensure the proxy:
 * 1. Sets X-Real-IP to the actual client IP
 * 2. Strips/overwrites X-Forwarded-For from client requests
 * 3. Does not allow clients to set these headers directly
 */
export function getClientIp(request: Request): string {
  // Prefer X-Real-IP (set by trusted reverse proxy)
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  // Fall back to X-Forwarded-For only if X-Real-IP is not set
  // Note: This is vulnerable to spoofing if proxy doesn't strip client headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  return "unknown";
}

/**
 * Rate limit headers for response
 */
export function getRateLimitHeaders(
  remaining: number,
  resetTime: number,
  limit: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetTime / 1000)),
  };
}
