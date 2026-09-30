# ADR-002: In-Memory Rate Limiting with LRU Eviction

## Status
Accepted — **amended 2026-09-29** (see Amendment at the end): distributed
fail-closed enforcement via Upstash Redis REST is now implemented; the
in-memory LRU limiter remains the explicit fallback for dev/desktop mode.

## Context
OmniChat uses rate limiting to reduce abuse on selected authentication and API paths. The current implementation favors in-process storage and bounded memory without an external service; it does not provide distributed enforcement or universal endpoint coverage.

## Decision
Use an in-memory fixed-window counter with expiry cleanup and LRU (Least Recently Used) eviction.

### Implementation Details
- **Storage**: One module-level JavaScript `Map`, shared by limiter instances in that process. Key prefixes separate policies, not storage capacity.
- **API**: [createRateLimiter](../../src/lib/rate-limit.ts) returns `check` and `reset` functions, not a class with its own store.
- **Algorithm**: A new identifier starts a fixed window at the first check, with `count = 1` and `resetTime = now + windowMs`. Later checks do not move the reset time; this is not a sliding window.
- **Counting**: Allowed checks increment the count. Blocked checks do not increment it, but both refresh `lastAccessed`. Checks return limit status, remaining requests, reset time in milliseconds, and retry delay in seconds.
- **Expiry**: A checked entry is replaced only when its reset time is strictly earlier than the current time; equality still uses the old window. `reset(identifier)` deletes that key immediately.
- **Capacity**: `maxStoreSize` defaults to 10,000 entries and is configurable per limiter, but applies to the shared store, not a separate per-endpoint allocation.

### Eviction Strategy
1. **On Insertion**: Only an absent key triggers eviction, before insertion, when the shared store is at or above that limiter's threshold.
2. **Expired Entries First**: Scan and remove expired entries, stopping as soon as the store is below the threshold.
3. **LRU Fallback**: If still at or above the threshold, scan for the smallest `lastAccessed` timestamp and remove one entry. This is not a loop that guarantees a smaller configured cap if the shared store is already above it.
4. **Interval Cleanup**: A timer scheduled every 60 seconds scans all entries and removes those whose reset time is strictly earlier than now. It is unreferenced in Node.js so it does not keep the process alive; expiration is also handled lazily on checks.

## Consequences

### Positive
- **No External Service**: Checks use local memory, without network calls
- **Low-Cost Lookups**: Ordinary map lookups are O(1); cleanup and LRU scans are O(n)
- **Memory Control**: Expiry cleanup and insertion-time eviction limit growth with the current shared default threshold
- **Configurable Policies**: Window length, request allowance, identifier key generation, and eviction threshold are configurable in code

### Negative
- **Per-Process Only**: Workers, server processes, and serverless instances track independently; restarts lose state. There is no deployment-wide quota.
- **Boundary Bursts**: Requests can cluster at the end of one fixed window and the start of the next
- **Eviction Weakens Enforcement**: Evicting an active identifier discards its counter and permits a fresh window on its next check
- **Shared Capacity**: Policies compete for the same store; configurable thresholds are not isolated per-limiter hard caps
- **Clock Dependence**: `Date.now()` uses wall-clock time and does not prevent clock adjustments from affecting windows
- **IP Trust**: IP-based enforcement requires a trusted proxy to overwrite client-supplied forwarding headers; missing headers group callers under `unknown`

### Deployment Considerations
Distributed enforcement would require a shared backend and atomic operations. Redis is a possible future option, not an implemented backend or a ready-made swap: network access would require changes to the current synchronous checks and their callers.

## Alternatives Considered

### Fixed Window Counter
- **Selected**: Simple counters and expiry; accepts boundary bursts rather than smoothing them

### Redis-based Rate Limiting
- **Tradeoff**: Shared state and atomic operations require additional infrastructure and network access
- **Status**: Not implemented; no Phase 4 delivery guarantee

### Token Bucket
- **Tradeoff**: Controls refill rate and burst capacity; can refill lazily rather than requiring a background timer
- **Status**: Not implemented

### Sliding Window Counter or Log
- **Tradeoff**: Tracks a moving window; a log additionally stores individual request timestamps
- **Status**: Neither is implemented by the current fixed-window counter

## Rate Limit Tiers and Actual Callers

| Caller | Limit | Window | Identifier |
|--------|-------|--------|------------|
| [Credentials authorization](../../src/lib/auth/config.ts) | 5 | 15 min | IP, after checking that credentials are present |
| [POST /api/api-keys](../../src/app/api/api-keys/route.ts) | 10 | 1 min | IP, before handler authentication, even when provider validation is skipped |
| [POST /api/chat](../../src/app/api/chat/route.ts) | 60 | 1 min | Authenticated user ID |
| [POST /api/projects](../../src/app/api/projects/route.ts) | 30 | 1 min | Authenticated user ID |

These checks count attempts reaching them, including requests that later fail validation. Credentials authorization prefers the first `X-Forwarded-For` value, then `X-Real-IP`; the API-key route's `getClientIp` helper prefers `X-Real-IP`, then the first `X-Forwarded-For` value.

This is not a universal auth, write, or delete policy: OAuth does not use the credentials limiter, and the write limiter is attached only to project creation. The 5-per-minute delete values in [constants](../../src/lib/constants.ts) are not wired into a delete limiter or route.

## Monitoring and Response Headers
`getRateLimitHeaders` produces `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (reset time rounded up to Unix seconds). Callers must attach them explicitly:

| Caller | Successful response | Limiter rejection |
|--------|---------------------|-------------------|
| Chat POST | All three rate-limit headers on the streaming response | 429 with all three headers and `Retry-After` |
| API-key POST | No rate-limit headers | 429 with all three headers and `Retry-After` |
| Project POST | All three headers on 201 | 429 with all three headers, but no `Retry-After` |
| Credentials authorization | No custom rate-limit headers | Returns `null`; no custom 429 or rate-limit headers |

`Retry-After`, where attached, is a delay in seconds. Other error paths generally omit rate-limit headers, even if a check has already consumed an allowance. The shared [rateLimitResponse helper](../../src/lib/api/middleware.ts) does not automatically enforce limits or attach headers to routes.

## Future Enhancements
A shared backend, adaptive limits, and rate-limit analytics are possible future work, not capabilities of the current limiter.

## References
- [OWASP Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [LRU Eviction](https://en.wikipedia.org/wiki/Cache_replacement_policies#LRU)

## Amendment (2026-09-29): Distributed fail-closed backend implemented

The "Deployment Considerations" limitation above ("Redis is a possible future
option, not an implemented backend") is superseded by
[src/lib/rate-limit-redis-rest.ts](../../src/lib/rate-limit-redis-rest.ts):

- **Backend selection** (`resolveRateLimitBackend`, lazy so imports never need
  live credentials): `RATE_LIMIT_BACKEND=redis-rest|memory`; when unset,
  development and `DESKTOP_MODE=true` default to memory, everything else
  defaults to redis-rest.
- **Protocol**: fixed-window counters via Upstash HTTP REST
  (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, keys namespaced by
  `RATE_LIMIT_PREFIX`), so counters are shared across processes/replicas and
  survive restarts — closing the "Per-Process Only" negative above.
- **Fail-closed**: invalid configuration, non-HTTPS URLs, HTTP errors, or
  malformed responses raise `RateLimitBackendUnavailableError`; routes answer
  **503 Service unavailable** instead of silently allowing unlimited traffic.
  This inverts the memory limiter's failure mode (state loss on restart) into
  an explicit unavailable state.
- The synchronous in-memory limiter above is retained unchanged as the
  dev/desktop backend, so local work still needs no external service.
- Verified by tests in `src/lib/__tests__/` (21-entry complexity baseline
  entry `resolveRateLimitBackend` documents the validation paths).
