import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let rateLimit: typeof import("../rate-limit");
const now = 1_800_000_000_000;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
    vi.stubEnv("DESKTOP_MODE", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.stubEnv("RATE_LIMIT_PREFIX", undefined);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    rateLimit = await import("../rate-limit");
});

afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("explicit memory mode", () => {
    it("allows requests within the limit with unchanged result fields", async () => {
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
        const pending = limiter.check("user1");
        expect(pending).toBeInstanceOf(Promise);
        expect(await pending).toEqual({
            limited: false, remaining: 4, resetTime: now + 60_000, retryAfter: 0,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("allows exactly the quota, then blocks without extending the window", async () => {
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
        await limiter.check("user1");
        expect(await limiter.check("user1")).toMatchObject({ limited: false, remaining: 0 });
        vi.advanceTimersByTime(1_001);
        expect(await limiter.check("user1")).toEqual({
            limited: true, remaining: 0, resetTime: now + 60_000, retryAfter: 59,
        });
        vi.advanceTimersByTime(1_000);
        expect(await limiter.check("user1")).toMatchObject({ resetTime: now + 60_000, retryAfter: 58 });
    });

    it("preserves the existing exact-boundary behavior and resets after expiration", async () => {
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        await limiter.check("user1");
        vi.advanceTimersByTime(60_000);
        expect(await limiter.check("user1")).toMatchObject({ limited: true, retryAfter: 0 });
        vi.advanceTimersByTime(1);
        expect(await limiter.check("user1")).toEqual({
            limited: false, remaining: 0, resetTime: now + 120_001, retryAfter: 0,
        });
    });

    it("uses custom key generators and keeps identifiers separate", async () => {
        const limiter = rateLimit.createRateLimiter({
            windowMs: 60_000, maxRequests: 1, keyGenerator: (id) => `custom:${id}`,
        });
        await limiter.check("user1");
        expect((await limiter.check("user1")).limited).toBe(true);
        expect((await limiter.check("user2")).limited).toBe(false);
    });

    it("shares the local store between factories with identical generated keys", async () => {
        const first = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        const second = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        await first.check("shared");
        expect((await second.check("shared")).limited).toBe(true);
        const reset = second.reset("shared");
        expect(reset).toBeInstanceOf(Promise);
        await reset;
        expect((await first.check("shared")).limited).toBe(false);
    });

    it("resets only the specified identifier using the same key generator", async () => {
        const limiter = rateLimit.createRateLimiter({
            windowMs: 60_000, maxRequests: 1, keyGenerator: (id) => `custom:${id}`,
        });
        await limiter.check("user1");
        await limiter.check("user2");
        await limiter.reset("user1");
        await limiter.reset("missing");
        expect((await limiter.check("user1")).limited).toBe(false);
        expect((await limiter.check("user2")).limited).toBe(true);
    });

    it("evicts the least recently accessed entry when full", async () => {
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 2, maxStoreSize: 2 });
        await limiter.check("user1");
        vi.advanceTimersByTime(1_000);
        await limiter.check("user2");
        vi.advanceTimersByTime(1_000);
        await limiter.check("user1");
        vi.advanceTimersByTime(1_000);
        await limiter.check("user3");
        expect((await limiter.check("user1")).limited).toBe(true);
        expect((await limiter.check("user2")).remaining).toBe(1);
    });

    it("evicts expired entries before still-active entries", async () => {
        const limiter = rateLimit.createRateLimiter({ windowMs: 1_000, maxRequests: 2, maxStoreSize: 2 });
        await limiter.check("expired");
        vi.advanceTimersByTime(500);
        await limiter.check("active");
        vi.advanceTimersByTime(501);
        await limiter.check("new");
        expect((await limiter.check("active")).remaining).toBe(0);
    });

    it("handles empty generated keys during LRU eviction", async () => {
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 2, maxStoreSize: 1 });
        await limiter.check("");
        await limiter.check("new");
        expect((await limiter.check("")).remaining).toBe(1);
    });

    it("creates no periodic timers on repeated module loads", async () => {
        await rateLimit.chatRateLimiter.check("user");
        vi.resetModules();
        await import("../rate-limit");
        expect(vi.getTimerCount()).toBe(0);
    });
});

function configureRest() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_BACKEND", "redis-rest");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-token");
    vi.stubEnv("RATE_LIMIT_PREFIX", "omnichat:test");
}

describe("distributed factory and quota semantics", () => {
    it("shares quotas and reset across independent worker modules", async () => {
        configureRest();
        const state = new Map<string, { count: number; resetTime: number }>();
        let serverNow = now;
        fetchMock.mockImplementation(async (_, init) => {
            const command = JSON.parse(init!.body as string) as (string | number)[];
            if (command[0] === "DEL") {
                return Response.json({ result: state.delete(command[1] as string) ? 1 : 0 });
            }
            expect(command[0]).toBe("EVAL");
            const key = command[3] as string;
            let entry = state.get(key);
            if (!entry || entry.resetTime <= serverNow) {
                entry = { count: 0, resetTime: serverNow + Number(command[4]) };
            }
            entry.count++;
            state.set(key, entry);
            return Response.json({ result: [entry.count, entry.resetTime - serverNow, serverNow] });
        });
        const first = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
        vi.resetModules();
        const worker = await import("../rate-limit");
        const second = worker.createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
            (i % 2 ? first : second).check("email@example.com")
        ));
        expect(results.filter((result) => !result.limited)).toHaveLength(5);
        expect(results.filter((result) => result.limited)).toHaveLength(15);
        expect(results[4]).toEqual({ limited: false, remaining: 0, resetTime: now + 60_000, retryAfter: 0 });
        expect(results[5]).toEqual({ limited: true, remaining: 0, resetTime: now + 60_000, retryAfter: 60 });
        serverNow += 1_234;
        expect(await second.check("email@example.com")).toEqual({
            limited: true, remaining: 0, resetTime: now + 60_000, retryAfter: 59,
        });
        serverNow = now + 60_000;
        expect(await first.check("email@example.com")).toMatchObject({ limited: false, remaining: 4 });
        await second.reset("email@example.com");
        expect((await first.check("email@example.com")).remaining).toBe(4);
        expect(state.size).toBe(1);
    });

    it("uses a positive Retry-After for Redis quota exhaustion with a submillisecond TTL", async () => {
        configureRest();
        fetchMock.mockResolvedValue(Response.json({ result: [2, 0, now] }));
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        expect(await limiter.check("user")).toEqual({ limited: true, remaining: 0, resetTime: now, retryAfter: 1 });
    });

    it("does not turn a provider 429 into user quota exhaustion", async () => {
        configureRest();
        fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        await expect(limiter.check("user")).rejects.toMatchObject({ status: 503, reason: "http" });
    });

    it("does not use memory after an outage or switch backends on an existing instance", async () => {
        configureRest();
        fetchMock.mockRejectedValue(new Error("offline"));
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        await expect(limiter.check("user")).rejects.toBeInstanceOf(rateLimit.RateLimitBackendUnavailableError);
        vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
        await expect(limiter.check("user")).rejects.toBeInstanceOf(rateLimit.RateLimitBackendUnavailableError);
        await expect(limiter.reset("user")).rejects.toBeInstanceOf(rateLimit.RateLimitBackendUnavailableError);
        fetchMock.mockResolvedValue(Response.json({ result: [2, 59_000, now + 1_000] }));
        expect((await limiter.check("user")).limited).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("does not contaminate the explicit local store on Redis failure", async () => {
        configureRest();
        fetchMock.mockRejectedValue(new Error("offline"));
        const remote = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
        await expect(remote.check("user")).rejects.toBeInstanceOf(rateLimit.RateLimitBackendUnavailableError);
        vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
        const local = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
        expect((await local.check("user")).remaining).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("defers environment validation until check/reset, including built-in limiters", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("RATE_LIMIT_BACKEND", undefined);
        vi.resetModules();
        const loadedLimiter = await import("../rate-limit");
        const limiter = loadedLimiter.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        expect(fetchMock).not.toHaveBeenCalled();
        await expect(limiter.check("user")).rejects.toBeInstanceOf(loadedLimiter.RateLimitBackendUnavailableError);
        await expect(limiter.reset("user")).rejects.toBeInstanceOf(loadedLimiter.RateLimitBackendUnavailableError);
        await expect(loadedLimiter.authRateLimiter.check("ip")).rejects.toMatchObject({ reason: "configuration" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("snapshots valid configuration on the first reset, not factory creation", async () => {
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        configureRest();
        fetchMock.mockResolvedValueOnce(Response.json({ result: 0 }));
        await limiter.reset("user");
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://other.example.test");
        vi.stubEnv("RATE_LIMIT_PREFIX", "other");
        fetchMock.mockResolvedValueOnce(Response.json({ result: [1, 60_000, now] }));
        await limiter.check("user");
        expect(fetchMock.mock.calls[1][0]).toBe("https://redis.example.test/");
        const reset = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
        const check = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
        expect(reset[1]).toBe(check[3]);
    });

    it("can recover from invalid configuration without ever selecting memory", async () => {
        vi.stubEnv("RATE_LIMIT_BACKEND", "redis-rest");
        const limiter = rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
        await expect(limiter.check("user")).rejects.toMatchObject({ reason: "configuration" });
        configureRest();
        fetchMock.mockResolvedValue(Response.json({ result: [1, 60_000, now] }));
        expect((await limiter.check("user")).remaining).toBe(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("factory argument validation", () => {
    it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid numeric option %s", (value) => {
        for (const name of ["windowMs", "maxRequests", "maxStoreSize"]) {
            expect(() => rateLimit.createRateLimiter({ windowMs: 60_000, maxRequests: 5, [name]: value }))
                .toThrow(RangeError);
        }
    });

    it("rejects an impractically large window before performing I/O", () => {
        expect(() => rateLimit.createRateLimiter({ windowMs: 2_147_483_648, maxRequests: 5 })).toThrow(RangeError);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("getClientIp", () => {
    it("extracts IP from x-real-ip header", () => {
        const request = new Request("http://localhost", { headers: { "x-real-ip": "1.2.3.4" } });
        expect(rateLimit.getClientIp(request)).toBe("1.2.3.4");
    });

    it("extracts first IP from x-forwarded-for", () => {
        const request = new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
        expect(rateLimit.getClientIp(request)).toBe("1.2.3.4");
    });

    it("prefers x-real-ip over x-forwarded-for", () => {
        const request = new Request("http://localhost", {
            headers: { "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" },
        });
        expect(rateLimit.getClientIp(request)).toBe("1.2.3.4");
    });

    it("returns 'unknown' when no IP headers present", () => {
        expect(rateLimit.getClientIp(new Request("http://localhost"))).toBe("unknown");
    });

    it("trims whitespace from IP addresses", () => {
        const request = new Request("http://localhost", { headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" } });
        expect(rateLimit.getClientIp(request)).toBe("1.2.3.4");
    });
});

describe("getRateLimitHeaders", () => {
    it("formats headers correctly", () => {
        expect(rateLimit.getRateLimitHeaders(45, 1700000000000, 60)).toEqual({
            "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": "45", "X-RateLimit-Reset": "1700000000",
        });
    });

    it("rounds reset time up", () => {
        expect(rateLimit.getRateLimitHeaders(0, 1700000000500, 10)["X-RateLimit-Reset"]).toBe("1700000001");
    });
});

describe("pre-configured limiters", () => {
    it("keeps chat, auth, and API key quotas and namespaces", async () => {
        expect((await rateLimit.chatRateLimiter.check("same-user")).remaining).toBe(59);
        expect((await rateLimit.authRateLimiter.check("same-user")).remaining).toBe(4);
        expect((await rateLimit.apiKeyRateLimiter.check("same-user")).remaining).toBe(9);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps built-in quotas and namespaces in Redis mode too", async () => {
        configureRest();
        fetchMock.mockImplementation(async (_, init) => {
            const command = JSON.parse(init!.body as string);
            return Response.json({ result: [1, command[4], now] });
        });
        expect(await rateLimit.chatRateLimiter.check("same-user")).toMatchObject({ remaining: 59, resetTime: now + 60_000 });
        expect(await rateLimit.authRateLimiter.check("same-user")).toMatchObject({ remaining: 4, resetTime: now + 900_000 });
        expect(await rateLimit.apiKeyRateLimiter.check("same-user")).toMatchObject({ remaining: 9, resetTime: now + 60_000 });
        const keys = fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string)[3]);
        expect(new Set(keys).size).toBe(3);
    });
});
