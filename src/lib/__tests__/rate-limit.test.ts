// src/lib/__tests__/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    createRateLimiter,
    getClientIp,
    getRateLimitHeaders,
    chatRateLimiter,
    authRateLimiter,
    apiKeyRateLimiter,
} from "../rate-limit";

describe("createRateLimiter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("allows requests within limit", () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 5,
        });

        const result = limiter.check("user1");
        expect(result.limited).toBe(false);
        expect(result.remaining).toBe(4);
    });

    it("blocks requests after limit exceeded", () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 2,
        });

        limiter.check("user1");
        limiter.check("user1");
        const result = limiter.check("user1");

        expect(result.limited).toBe(true);
        expect(result.remaining).toBe(0);
        expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("resets after window expires", () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 1,
        });

        limiter.check("user1");
        const blocked = limiter.check("user1");
        expect(blocked.limited).toBe(true);

        // Advance time past window
        vi.advanceTimersByTime(61000);

        const afterReset = limiter.check("user1");
        expect(afterReset.limited).toBe(false);
    });

    it("uses custom key generator", () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 1,
            keyGenerator: (id) => `custom:${id}`,
        });

        limiter.check("user1");
        const result = limiter.check("user1");
        expect(result.limited).toBe(true);

        // Different user should not be limited
        const other = limiter.check("user2");
        expect(other.limited).toBe(false);
    });

    it("resets specific identifier", () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 1,
        });

        limiter.check("user1");
        limiter.reset("user1");

        const result = limiter.check("user1");
        expect(result.limited).toBe(false);
    });

    it("evicts oldest entry when store is full", () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 100,
            maxStoreSize: 3, // Small for testing
        });

        // Fill the store
        limiter.check("user1");
        limiter.check("user2");
        limiter.check("user3");

        // This should trigger eviction
        const result = limiter.check("user4");
        expect(result.limited).toBe(false);
    });

    it("tracks last accessed time for LRU", () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 100,
            maxStoreSize: 2,
        });

        limiter.check("user1");
        vi.advanceTimersByTime(1000);
        limiter.check("user2");
        vi.advanceTimersByTime(1000);

        // Access user1 again (makes it more recent)
        limiter.check("user1");
        vi.advanceTimersByTime(1000);

        // Adding user3 should evict user2 (oldest access)
        const result = limiter.check("user3");
        expect(result.limited).toBe(false);
    });
});

describe("getClientIp", () => {
    it("extracts IP from x-real-ip header", () => {
        const request = new Request("http://localhost", {
            headers: { "x-real-ip": "1.2.3.4" },
        });
        expect(getClientIp(request)).toBe("1.2.3.4");
    });

    it("extracts first IP from x-forwarded-for", () => {
        const request = new Request("http://localhost", {
            headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
        });
        expect(getClientIp(request)).toBe("1.2.3.4");
    });

    it("prefers x-real-ip over x-forwarded-for", () => {
        const request = new Request("http://localhost", {
            headers: {
                "x-real-ip": "1.2.3.4",
                "x-forwarded-for": "5.6.7.8",
            },
        });
        expect(getClientIp(request)).toBe("1.2.3.4");
    });

    it("returns 'unknown' when no IP headers present", () => {
        const request = new Request("http://localhost");
        expect(getClientIp(request)).toBe("unknown");
    });

    it("trims whitespace from IP addresses", () => {
        const request = new Request("http://localhost", {
            headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
        });
        expect(getClientIp(request)).toBe("1.2.3.4");
    });
});

describe("getRateLimitHeaders", () => {
    it("formats headers correctly", () => {
        const headers = getRateLimitHeaders(45, 1700000000000, 60);
        expect(headers).toEqual({
            "X-RateLimit-Limit": "60",
            "X-RateLimit-Remaining": "45",
            "X-RateLimit-Reset": "1700000000",
        });
    });

    it("rounds reset time up", () => {
        const headers = getRateLimitHeaders(0, 1700000000500, 10);
        expect(headers["X-RateLimit-Reset"]).toBe("1700000001");
    });
});

describe("pre-configured limiters", () => {
    it("chatRateLimiter allows 60 requests per minute", () => {
        const result = chatRateLimiter.check("test-user");
        expect(result.limited).toBe(false);
        expect(result.remaining).toBe(59);
    });

    it("authRateLimiter allows 5 requests per 15 minutes", () => {
        const result = authRateLimiter.check("test-ip");
        expect(result.limited).toBe(false);
        expect(result.remaining).toBe(4);
    });

    it("apiKeyRateLimiter allows 10 requests per minute", () => {
        const result = apiKeyRateLimiter.check("test-user");
        expect(result.limited).toBe(false);
        expect(result.remaining).toBe(9);
    });
});
