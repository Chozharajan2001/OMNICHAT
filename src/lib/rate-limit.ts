/**
 * Simple in-memory rate limiter for OmniChat
 * For production, consider using Upstash Redis or similar
 * 
 * DEPLOYMENT NOTE: When behind a reverse proxy (nginx, Cloudflare, etc.),
 * ensure the proxy sets X-Real-IP header and strips spoofed X-Forwarded-For
 * from client requests. This implementation trusts X-Real-IP over X-Forwarded-For
 * to prevent IP spoofing attacks.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastAccessed: number; // Track last access time for LRU eviction
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (identifier: string) => string;
  maxStoreSize?: number; // Maximum number of entries before LRU eviction (default: 10000)
}

// In-memory store (resets on server restart)
const store = new Map<string, RateLimitEntry>();
const DEFAULT_MAX_STORE_SIZE = 10000;

// Store interval ID for cleanup (prevents leak on hot reload)
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

// Cleanup old entries every minute
if (typeof setInterval !== "undefined" && !cleanupIntervalId) {
  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetTime < now) {
        store.delete(key);
      }
    }
  }, 60_000);
  
  // Allow Node.js to exit even if interval is active
  if (typeof cleanupIntervalId.unref === "function") {
    cleanupIntervalId.unref();
  }
}

/**
 * Find and remove the oldest entry (LRU eviction).
 * Optimized to remove expired entries first, then evict by access time.
 */
function evictOldestEntry(maxStoreSize: number): void {
  if (store.size < maxStoreSize) return;
  
  const now = Date.now();
  let oldestKey: string | null = null;
  let oldestAccessTime = Infinity;
  
  // First pass: try to remove expired entries (cheap cleanup)
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key);
      // If we're now under the limit, we're done
      if (store.size < maxStoreSize) return;
    }
  }
  
  // Second pass: find oldest by lastAccessed time (LRU eviction)
  for (const [key, entry] of store.entries()) {
    if (entry.lastAccessed < oldestAccessTime) {
      oldestAccessTime = entry.lastAccessed;
      oldestKey = key;
    }
  }
  
  if (oldestKey) {
    store.delete(oldestKey);
  }
}

/**
 * Create a rate limiter instance
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator, maxStoreSize = DEFAULT_MAX_STORE_SIZE } = config;

  return {
    /**
     * Check if a request should be rate limited
     * @param identifier - Unique identifier (e.g., IP address, user ID)
     * @returns Object with limit status
     */
    check(identifier: string): {
      limited: boolean;
      remaining: number;
      resetTime: number;
      retryAfter: number;
    } {
      const key = keyGenerator ? keyGenerator(identifier) : identifier;
      const now = Date.now();
      const entry = store.get(key);

      // Enforce store size cap with optimized LRU eviction
      if (!entry && store.size >= maxStoreSize) {
        evictOldestEntry(maxStoreSize);
      }

      if (!entry || entry.resetTime < now) {
        // New window
        const resetTime = now + windowMs;
        store.set(key, { count: 1, resetTime, lastAccessed: now });
        return {
          limited: false,
          remaining: maxRequests - 1,
          resetTime,
          retryAfter: 0,
        };
      }

      // Update last accessed time
      entry.lastAccessed = now;

      if (entry.count >= maxRequests) {
        // Rate limited
        return {
          limited: true,
          remaining: 0,
          resetTime: entry.resetTime,
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        };
      }

      // Increment count
      entry.count++;
      return {
        limited: false,
        remaining: maxRequests - entry.count,
        resetTime: entry.resetTime,
        retryAfter: 0,
      };
    },

    /**
     * Reset the rate limit for an identifier
     */
    reset(identifier: string): void {
      const key = keyGenerator ? keyGenerator(identifier) : identifier;
      store.delete(key);
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
export const apiKeyRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 10,
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
