import { createHash } from "node:crypto";

export type RateLimitBackendFailure =
  | "configuration"
  | "timeout"
  | "transport"
  | "http"
  | "response";

/** Safe to report without exposing credentials, identifiers, or provider errors. */
export class RateLimitBackendUnavailableError extends Error {
  readonly code = "RATE_LIMIT_BACKEND_UNAVAILABLE";
  readonly status = 503;

  constructor(readonly reason: RateLimitBackendFailure) {
    super("Rate limiting is temporarily unavailable");
    this.name = "RateLimitBackendUnavailableError";
  }
}

export function isRateLimitBackendUnavailableError(
  error: unknown
): error is RateLimitBackendUnavailableError {
  return error instanceof RateLimitBackendUnavailableError;
}

export interface RedisRestConfig {
  backend: "redis-rest";
  url: string;
  token: string;
  prefix: string;
}

export type RateLimitBackendConfig = { backend: "memory" } | RedisRestConfig;

/** Resolve lazily so importing server modules never requires live Redis credentials. */
export function resolveRateLimitBackend(
  env: Readonly<Record<string, string | undefined>> = process.env
): RateLimitBackendConfig {
  const backend = env.RATE_LIMIT_BACKEND ?? (
    env.NODE_ENV === "development" || env.DESKTOP_MODE === "true"
      ? "memory"
      : "redis-rest"
  );

  if (backend === "memory") return { backend };
  if (backend !== "redis-rest") {
    throw new RateLimitBackendUnavailableError("configuration");
  }

  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const prefix = env.RATE_LIMIT_PREFIX;
  if (
    !url || !/^https:\/\/[^/]/i.test(url) || /[\s\x00-\x1f\x7f\\?#]/.test(url) ||
    !token || !/^[\x21-\x7e]+$/.test(token) ||
    !prefix || !/^[a-zA-Z0-9:_-]{1,128}$/.test(prefix)
  ) {
    throw new RateLimitBackendUnavailableError("configuration");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RateLimitBackendUnavailableError("configuration");
  }
  if (
    parsed.protocol !== "https:" || !parsed.hostname ||
    parsed.username || parsed.password || parsed.search || parsed.hash
  ) {
    throw new RateLimitBackendUnavailableError("configuration");
  }

  return { backend, url: parsed.toString(), token, prefix };
}

export const REDIS_REST_TIMEOUT_MS = 2_000;

// One command owns the increment and expiration. Rejected attempts never slide
// the window. TIME makes the absolute reset timestamp independent of worker clocks.
const CHECK_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
local now = redis.call('TIME')
return {count, ttl, tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)}
`;

export interface RedisRateLimitWindow {
  count: number;
  ttlMs: number;
  resetTime: number;
}

/** Each instance is stateless; workers with identical prefixes share Redis keys. */
export function createRedisRestBackend(config: RedisRestConfig) {
  function rateKey(identifier: string): string {
    // Hash every generated key, not just recognizable email/IP formats. The
    // prefix must be a deployment name, never an identifier or a process ID.
    const hash = createHash("sha256").update(identifier).digest("hex");
    return `${config.prefix}:v1:${hash}`;
  }

  async function execute(command: (string | number)[]): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new RateLimitBackendUnavailableError("timeout"));
        controller.abort();
      }, REDIS_REST_TIMEOUT_MS);
    });

    async function request(): Promise<unknown> {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      });
      // A provider 429 is an unavailable backend, not a user quota decision.
      if (!response.ok) throw new RateLimitBackendUnavailableError("http");
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new RateLimitBackendUnavailableError("response");
      }
      if (
        !body || typeof body !== "object" || Array.isArray(body) ||
        "error" in body || !("result" in body)
      ) {
        throw new RateLimitBackendUnavailableError("response");
      }
      return body.result;
    }

    try {
      // Also bounds noncompliant fetch implementations that ignore cancellation.
      return await Promise.race([request(), timeout]);
    } catch (error) {
      if (isRateLimitBackendUnavailableError(error)) throw error;
      // Do not retain a cause: provider messages can include tokens or PII.
      throw new RateLimitBackendUnavailableError("transport");
    } finally {
      clearTimeout(timer);
      // Stop unread response bodies on HTTP/JSON errors as well as on timeout.
      controller.abort();
    }
  }

  return {
    async check(identifier: string, windowMs: number): Promise<RedisRateLimitWindow> {
      const result = await execute(["EVAL", CHECK_SCRIPT, 1, rateKey(identifier), windowMs]);
      if (
        !Array.isArray(result) || result.length !== 3 ||
        !result.every((value) => typeof value === "number" && Number.isSafeInteger(value))
      ) {
        throw new RateLimitBackendUnavailableError("response");
      }
      const [count, ttlMs, serverTime] = result as number[];
      if (
        count < 1 || ttlMs < 0 || ttlMs > windowMs || serverTime < 1 ||
        !Number.isSafeInteger(serverTime + ttlMs)
      ) {
        throw new RateLimitBackendUnavailableError("response");
      }
      return { count, ttlMs, resetTime: serverTime + ttlMs };
    },

    async reset(identifier: string): Promise<void> {
      const result = await execute(["DEL", rateKey(identifier)]);
      if (result !== 0 && result !== 1) {
        throw new RateLimitBackendUnavailableError("response");
      }
    },
  };
}
