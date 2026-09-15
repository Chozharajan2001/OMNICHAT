# ADR-002: In-Memory Rate Limiting with LRU Eviction

## Status
Accepted

## Context
OmniChat needs rate limiting to prevent abuse and ensure fair resource usage across multiple endpoints:
- Authentication attempts (5 per 15 minutes per IP)
- API key validation (10 per minute per user)
- Chat messages (60 per minute per user)
- Write operations (30 per minute per user)

The rate limiting solution must:
- Work in both single-instance and distributed deployments
- Minimize memory usage
- Provide accurate tracking per user/IP
- Support automatic cleanup of expired entries

## Decision
Implement in-memory rate limiting with LRU (Least Recently Used) eviction and automatic cleanup.

### Implementation Details
- **Storage**: JavaScript `Map` for O(1) lookups
- **Eviction Policy**: LRU based on `lastAccessed` timestamp
- **Max Store Size**: 10,000 entries (configurable)
- **Cleanup Interval**: Every 60 seconds, remove expired entries
- **Algorithm**: Sliding window counter

### Code Structure
```typescript
interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastAccessed: number; // For LRU eviction
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  
  check(identifier: string): RateLimitResult {
    // 1. Check if entry exists and is within window
    // 2. If not, create new entry with count=1
    // 3. If exists, increment count
    // 4. Enforce store size cap with LRU eviction
    // 5. Return limit status, remaining requests, reset time
  }
}
```

### Eviction Strategy
1. **First Pass**: Remove expired entries (cheap cleanup)
2. **Second Pass**: If still over limit, evict by `lastAccessed` (LRU)
3. **Interval Cleanup**: Background task removes expired entries every 60s

## Consequences

### Positive
- **Zero Dependencies**: No external services required
- **Low Latency**: O(1) lookups, no network calls
- **Memory Efficient**: LRU eviction prevents unbounded growth
- **Simple Deployment**: Works out-of-the-box
- **Configurable**: Rate limits and store size adjustable per endpoint

### Negative
- **Single Instance**: State lost on server restart
- **No Distributed State**: Each instance tracks independently
- **Memory Usage**: 10k entries ≈ 1-2 MB (acceptable)
- **Clock Skew**: Relies on server time (mitigated by using `Date.now()`)

### Production Considerations
For distributed deployments (multiple instances):
- **Current**: Each instance has independent rate limits
- **Future**: Migrate to Redis for shared state
- **Migration Path**: Interface abstraction allows easy swap

## Alternatives Considered

### Redis-based Rate Limiting
- **Pros**: Distributed state, persistent, atomic operations
- **Cons**: Additional infrastructure, network latency, operational complexity
- **Verdict**: Deferred to Phase 4+ when scaling requires it

### Fixed Window Counter
- **Pros**: Simpler implementation
- **Cons**: Burst at window boundaries (e.g., 100 requests at 11:59, 100 at 12:00)
- **Verdict**: Rejected due to burst vulnerability

### Token Bucket
- **Pros**: Smooth rate limiting, allows bursts
- **Cons**: More complex, requires background refills
- **Verdict**: Rejected for simplicity; sliding window sufficient

### Sliding Window Log
- **Pros**: Most accurate
- **Cons**: High memory usage (stores every request)
- **Verdict**: Rejected due to memory overhead

## Rate Limit Tiers

| Endpoint | Limit | Window | Rationale |
|----------|-------|--------|-----------|
| Auth | 5 | 15 min | Prevent brute force |
| API Key Validation | 10 | 1 min | Prevent key guessing |
| Chat | 60 | 1 min | Fair usage, prevent abuse |
| Write Operations | 30 | 1 min | Prevent spam |
| Delete Operations | 5 | 1 min | Prevent accidental mass deletion |

## Monitoring
- **Headers**: All rate-limited responses include:
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Unix timestamp when limit resets
- **429 Responses**: Include `Retry-After` header

## Future Enhancements
1. **Redis Backend**: Swap `Map` for Redis when scaling horizontally
2. **Adaptive Rate Limiting**: Adjust limits based on server load
3. **Rate Limit Analytics**: Track abuse patterns
4. **Distributed Tracing**: Add correlation IDs for cross-instance tracking

## References
- [OWASP Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [Sliding Window Algorithm](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
- [LRU Eviction](https://en.wikipedia.org/wiki/Cache_replacement_policies#LRU)
