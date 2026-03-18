/**
 * Simple in-memory rate limiter for OmniChat
 * For production, consider using Upstash Redis or similar
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (identifier: string) => string;
}

// In-memory store (resets on server restart)
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every minute
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetTime < now) {
        store.delete(key);
      }
    }
  }, 60_000);
}

/**
 * Create a rate limiter instance
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator } = config;

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

      if (!entry || entry.resetTime < now) {
        // New window
        const resetTime = now + windowMs;
        store.set(key, { count: 1, resetTime });
        return {
          limited: false,
          remaining: maxRequests - 1,
          resetTime,
          retryAfter: 0,
        };
      }

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
 * Get client IP from request headers
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
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
