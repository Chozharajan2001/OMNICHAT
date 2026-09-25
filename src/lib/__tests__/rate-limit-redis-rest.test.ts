import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRedisRestBackend,
  isRateLimitBackendUnavailableError,
  RateLimitBackendUnavailableError,
  REDIS_REST_TIMEOUT_MS,
  resolveRateLimitBackend,
  type RedisRestConfig,
} from "../rate-limit-redis-rest";

const serverTime = 1_800_000_000_000;
const config: RedisRestConfig = {
  backend: "redis-rest",
  url: "https://redis.example.test/",
  token: "test-only-token",
  prefix: "omnichat:test",
};
const env = {
  NODE_ENV: "production",
  RATE_LIMIT_BACKEND: "redis-rest",
  UPSTASH_REDIS_REST_URL: config.url,
  UPSTASH_REDIS_REST_TOKEN: config.token,
  RATE_LIMIT_PREFIX: config.prefix,
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(serverTime);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("backend configuration", () => {
  it("accepts explicit memory without REST credentials, even in production", () => {
    expect(resolveRateLimitBackend({ NODE_ENV: "production", RATE_LIMIT_BACKEND: "memory" }))
      .toEqual({ backend: "memory" });
  });

  it("defaults only development and explicit desktop to memory", () => {
    expect(resolveRateLimitBackend({ NODE_ENV: "development" })).toEqual({ backend: "memory" });
    expect(resolveRateLimitBackend({ NODE_ENV: "production", DESKTOP_MODE: "true" }))
      .toEqual({ backend: "memory" });
    for (const environment of ["production", "test", "staging", undefined]) {
      expect(() => resolveRateLimitBackend({ NODE_ENV: environment }))
        .toThrow(RateLimitBackendUnavailableError);
    }
  });

  it("defaults hosted configurations to REST and honors explicit REST in development", () => {
    expect(resolveRateLimitBackend({ ...env, RATE_LIMIT_BACKEND: undefined })).toEqual(config);
    expect(resolveRateLimitBackend({ ...env, NODE_ENV: "development", DESKTOP_MODE: "true" }))
      .toEqual(config);
  });

  it.each(["", "redis", "Memory", "redis-rest "])("rejects invalid backend %j", (backend) => {
    expect(() => resolveRateLimitBackend({ ...env, RATE_LIMIT_BACKEND: backend }))
      .toThrow(RateLimitBackendUnavailableError);
  });

  it.each(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "RATE_LIMIT_PREFIX"])(
    "requires %s rather than silently using memory",
    (name) => {
      for (const value of [undefined, "", " "]) {
        expect(() => resolveRateLimitBackend({ ...env, [name]: value }))
          .toThrow(RateLimitBackendUnavailableError);
      }
    }
  );

  it.each([
    "not-a-url", "http://redis.example.test", "file:///redis", "ftp://redis.example.test",
    "https://user:secret@redis.example.test", "https://redis.example.test?token=secret",
    "https://redis.example.test#fragment", "https://redis.example.test?",
    "https://redis.example.test#", " https://redis.example.test",
    "https://redis.example.test\n", "https:\\redis.example.test",
  ])("rejects unsafe/malformed URL %j", (url) => {
    expect(() => resolveRateLimitBackend({ ...env, UPSTASH_REDIS_REST_URL: url }))
      .toThrow(RateLimitBackendUnavailableError);
  });

  it.each(["token\nsecret", "token secret", "token\u0000secret"])("rejects unsafe tokens", (token) => {
    expect(() => resolveRateLimitBackend({ ...env, UPSTASH_REDIS_REST_TOKEN: token }))
      .toThrow(RateLimitBackendUnavailableError);
  });

  it.each(["email@example.com", "deployment/name", "{deployment}", "x".repeat(129)])(
    "rejects unsafe deployment prefixes", (prefix) => {
      expect(() => resolveRateLimitBackend({ ...env, RATE_LIMIT_PREFIX: prefix }))
        .toThrow(RateLimitBackendUnavailableError);
    }
  );
});

describe("REST atomic fixed windows", () => {
  function sharedRedis() {
    const state = new Map<string, { count: number; expires: number | null }>();
    let now = serverTime;
    fetchMock.mockImplementation(async (input, init) => {
      expect(input).toBe(config.url);
      expect(init).toMatchObject({
        method: "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      });
      const command = JSON.parse(init!.body as string) as (string | number)[];
      if (command[0] === "DEL") {
        expect(command).toHaveLength(2);
        return Response.json({ result: state.delete(command[1] as string) ? 1 : 0 });
      }
      expect(command).toHaveLength(5);
      expect(command[0]).toBe("EVAL");
      expect(command[2]).toBe(1);
      const script = command[1] as string;
      expect(script).toContain("redis.call('INCR', KEYS[1])");
      expect(script).toContain("redis.call('PTTL', KEYS[1])");
      expect(script).toContain("if count == 1 or ttl < 0 then");
      expect(script).toContain("redis.call('PEXPIRE', KEYS[1], ARGV[1])");
      expect(script).toContain("redis.call('TIME')");
      const key = command[3] as string;
      const windowMs = command[4] as number;
      let entry = state.get(key);
      if (!entry || (entry.expires !== null && entry.expires <= now)) {
        entry = { count: 0, expires: null };
      }
      entry.count++;
      if (entry.count === 1 || entry.expires === null) entry.expires = now + windowMs;
      state.set(key, entry);
      return Response.json({ result: [entry.count, entry.expires - now, now] });
    });
    return { state, advance: (ms: number) => { now += ms; } };
  }

  it("shares atomic increments between independent clients without exposing PII", async () => {
    const redis = sharedRedis();
    const first = createRedisRestBackend(config);
    const second = createRedisRestBackend({ ...config });
    const checks = await Promise.all(Array.from({ length: 40 }, (_, i) =>
      (i % 2 ? first : second).check("auth:user@example.com:203.0.113.7", 60_000)
    ));
    expect(checks.map((result) => result.count)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(new Set(checks.map((result) => result.resetTime))).toEqual(new Set([serverTime + 60_000]));
    expect(redis.state.size).toBe(1);
    const key = [...redis.state.keys()][0];
    expect(key).toMatch(/^omnichat:test:v1:[a-f0-9]{64}$/);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init!.body).not.toContain("user@example.com");
      expect(init!.body).not.toContain("203.0.113.7");
    }
    expect(fetchMock).toHaveBeenCalledTimes(40);
  });

  it("preserves TTL/reset time and uses server time rather than a skewed worker clock", async () => {
    const redis = sharedRedis();
    const client = createRedisRestBackend(config);
    const first = await client.check("user", 60_000);
    redis.advance(1_234);
    vi.setSystemTime(serverTime + 999_999);
    expect(await client.check("user", 60_000)).toEqual({
      count: 2, ttlMs: 58_766, resetTime: first.resetTime,
    });
    redis.advance(58_766);
    expect(await client.check("user", 60_000)).toEqual({
      count: 1, ttlMs: 60_000, resetTime: serverTime + 120_000,
    });
  });

  it("resets only the selected identifier across clients; absent reset is idempotent", async () => {
    sharedRedis();
    const first = createRedisRestBackend(config);
    const second = createRedisRestBackend(config);
    await first.check("user-a", 60_000);
    await first.check("user-b", 60_000);
    await second.reset("user-a");
    await second.reset("user-a");
    expect((await first.check("user-a", 60_000)).count).toBe(1);
    expect((await first.check("user-b", 60_000)).count).toBe(2);
  });

  it("isolates deployments and generated limiter namespaces", async () => {
    const redis = sharedRedis();
    const prod = createRedisRestBackend(config);
    const preview = createRedisRestBackend({ ...config, prefix: "omnichat:preview" });
    await prod.check("auth:user", 60_000);
    await prod.check("chat:user", 60_000);
    await preview.check("auth:user", 60_000);
    expect(redis.state.size).toBe(3);
    await preview.reset("auth:user");
    expect((await prod.check("auth:user", 60_000)).count).toBe(2);
  });

  it("repairs a counter without expiration without forgiving its quota", async () => {
    const redis = sharedRedis();
    const client = createRedisRestBackend(config);
    await client.check("user", 60_000);
    redis.state.set([...redis.state.keys()][0], { count: 5, expires: null });
    expect(await client.check("user", 60_000)).toEqual({
      count: 6, ttlMs: 60_000, resetTime: serverTime + 60_000,
    });
  });
});

describe("fail-closed REST failures", () => {
  const client = createRedisRestBackend(config);

  it.each([401, 403, 429, 500, 503, 302])("treats HTTP %s as backend failure, never a quota", async (status) => {
    fetchMock.mockResolvedValue(new Response("secret provider failure", { status }));
    await expect(client.check("user", 60_000)).rejects.toMatchObject({
      code: "RATE_LIMIT_BACKEND_UNAVAILABLE", status: 503, reason: "http",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);
  });

  it.each([
    null, [], {}, { error: "provider secret" }, { result: [1, 1, serverTime], error: null },
    { result: null }, { result: "1" }, { result: [] }, { result: [1, 2] },
    { result: [1, 2, serverTime, 4] }, { result: ["1", 2, serverTime] },
    { result: [1.5, 2, serverTime] }, { result: [0, 2, serverTime] },
    { result: [-1, 2, serverTime] }, { result: [Number.MAX_SAFE_INTEGER + 1, 2, serverTime] },
    { result: [1, -1, serverTime] }, { result: [1, -2, serverTime] },
    { result: [1, 60_001, serverTime] }, { result: [1, 2.5, serverTime] },
    { result: [1, 2, "1700000000000"] }, { result: [1, 2, 0] },
    { result: [1, 2, Number.MAX_SAFE_INTEGER] }, { result: [null, 2, serverTime] },
  ])("rejects malformed success payload %#", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(client.check("user", 60_000)).rejects.toMatchObject({ reason: "response", status: 503 });
  });

  it("accepts a zero TTL at the expiration boundary", async () => {
    fetchMock.mockResolvedValue(Response.json({ result: [2, 0, serverTime] }));
    expect(await client.check("user", 60_000)).toEqual({ count: 2, ttlMs: 0, resetTime: serverTime });
  });

  it("rejects invalid JSON without leaking its contents", async () => {
    fetchMock.mockResolvedValue(new Response("secret token <invalid JSON>"));
    await expect(client.check("email@example.com", 60_000)).rejects.toMatchObject({
      message: "Rate limiting is temporarily unavailable", reason: "response",
    });
  });

  it("sanitizes network exceptions without logging or retrying ambiguous increments", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error(`secret ${config.token} user@example.com`));
    try {
      const error = await client.check("user@example.com", 60_000).catch((error: unknown) => error);
      expect(isRateLimitBackendUnavailableError(error)).toBe(true);
      expect(String(error)).not.toContain(config.token);
      expect(String(error)).not.toContain("user@example.com");
      expect(error).not.toHaveProperty("cause");
      expect(log).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it.each([null, "1", -1, 2, [], {}, { error: "secret" }])("validates reset result %#", async (result) => {
    fetchMock.mockResolvedValue(Response.json({ result }));
    await expect(client.reset("user")).rejects.toMatchObject({ reason: "response" });
  });

  it("propagates reset transport errors", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(client.reset("user")).rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
  });

  it.each(["check", "reset"] as const)("bounds and aborts a hung %s even if fetch ignores abort", async (method) => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = method === "check" ? client.check("user", 60_000) : client.reset("user");
    const rejected = expect(pending).rejects.toMatchObject({ reason: "timeout", status: 503 });
    await vi.advanceTimersByTimeAsync(REDIS_REST_TIMEOUT_MS - 1);
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);
  });

  it("bounds body parsing and observes late rejections after timeout", async () => {
    let rejectBody!: (error: Error) => void;
    const response = new Response();
    vi.spyOn(response, "json").mockImplementation(() => new Promise((_, reject) => { rejectBody = reject; }));
    fetchMock.mockResolvedValue(response);
    const rejected = expect(client.check("user", 60_000)).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(REDIS_REST_TIMEOUT_MS);
    await rejected;
    rejectBody(new Error("late secret response"));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("rejects URL normalization tricks and non-ASCII credentials before HTTP", () => {
    for (const url of ["https:redis.example.test", "https:/redis.example.test", "https:///redis.example.test", "https://redis.example.test/\u0000"]) {
      expect(() => resolveRateLimitBackend({ ...env, UPSTASH_REDIS_REST_URL: url }))
        .toThrow(RateLimitBackendUnavailableError);
    }
    expect(() => resolveRateLimitBackend({ ...env, UPSTASH_REDIS_REST_TOKEN: "tökén" }))
      .toThrow(RateLimitBackendUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("observes an abort-aware fetch rejection without masking the timeout", async () => {
    fetchMock.mockImplementation((_, init) => new Promise((_, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const rejected = expect(client.check("user", 60_000)).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(REDIS_REST_TIMEOUT_MS);
    await rejected;
  });

  it("observes a late fetch rejection after timing out", async () => {
    let rejectFetch!: (error: Error) => void;
    fetchMock.mockImplementation(() => new Promise((_, reject) => { rejectFetch = reject; }));
    const rejected = expect(client.check("user", 60_000)).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(REDIS_REST_TIMEOUT_MS);
    await rejected;
    rejectFetch(new Error("late transport failure"));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("recognizes only the typed backend error", () => {
    expect(isRateLimitBackendUnavailableError(new RateLimitBackendUnavailableError("configuration"))).toBe(true);
    expect(isRateLimitBackendUnavailableError(new Error("unavailable"))).toBe(false);
    expect(isRateLimitBackendUnavailableError(null)).toBe(false);
    expect(isRateLimitBackendUnavailableError({ code: "RATE_LIMIT_BACKEND_UNAVAILABLE" })).toBe(false);
  });
});
