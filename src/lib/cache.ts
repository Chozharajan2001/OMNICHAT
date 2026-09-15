// src/lib/cache.ts
// Simple in-memory caching layer with TTL support

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheOptions {
  ttlMs: number;
  key: string;
}

/**
 * Simple in-memory cache with TTL (Time-To-Live) support
 * 
 * Features:
 * - Automatic expiration of entries based on TTL
 * - Background cleanup of expired entries every 60 seconds
 * - Type-safe generic operations
 * - Cache statistics and monitoring
 * 
 * Limitations:
 * - Single-instance only (no distributed caching)
 * - Memory-bound (no persistence)
 * - For production multi-instance deployments, use Redis
 * 
 * @example
 * ```typescript
 * const cache = new MemoryCache();
 * cache.set('user:123', userData, 60000); // 1 minute TTL
 * const user = cache.get<User>('user:123');
 * ```
 */
class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Cleanup expired entries every minute
    if (typeof setInterval !== "undefined" && !this.cleanupIntervalId) {
      this.cleanupIntervalId = setInterval(() => {
        this.cleanup();
      }, 60_000);

      if (typeof this.cleanupIntervalId.unref === "function") {
        this.cleanupIntervalId.unref();
      }
    }
  }

  /**
   * Retrieve cached data if it exists and hasn't expired
   * 
   * @param key - Cache key to lookup
   * @returns The cached data if found and not expired, null otherwise
   * 
   * @example
   * ```typescript
   * const user = cache.get<User>('user:123');
   * if (user) {
   *   console.log('Cache hit:', user);
   * } else {
   *   console.log('Cache miss or expired');
   * }
   * ```
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store data in cache with a time-to-live (TTL)
   * 
   * @param key - Cache key for later retrieval
   * @param data - Data to cache (must be serializable)
   * @param ttlMs - Time-to-live in milliseconds before expiration
   * 
   * @example
   * ```typescript
   * cache.set('user:123', userData, 60000); // Expires in 1 minute
   * cache.set('config', configData, 3600000); // Expires in 1 hour
   * ```
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      expiresAt: now + ttlMs,
      createdAt: now,
    });
  }

  /**
   * Delete specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Global cache instance
 */
export const cache = new MemoryCache();

/**
 * Cache wrapper function implementing the cache-aside pattern
 * 
 * Automatically handles cache lookup, fetch on miss, and storage.
 * Ideal for wrapping expensive operations (database queries, API calls).
 * 
 * @param options - Cache configuration
 * @param options.key - Unique cache key
 * @param options.ttlMs - Time-to-live in milliseconds
 * @param fetcher - Async function to fetch data on cache miss
 * @returns The cached or freshly fetched data
 * 
 * @example
 * ```typescript
 * const user = await cached(
 *   { key: 'user:123', ttlMs: 60000 },
 *   async () => await db.user.findUnique({ where: { id: '123' } })
 * );
 * ```
 */
export async function cached<T>(
  options: CacheOptions,
  fetcher: () => Promise<T>
): Promise<T> {
  const { key, ttlMs } = options;

  // Try to get from cache first
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch and cache
  const data = await fetcher();
  cache.set(key, data, ttlMs);
  return data;
}

/**
 * Invalidate cache entries matching a pattern
 * 
 * @param pattern - String key for exact match, or RegExp for pattern matching
 * 
 * @example
 * ```typescript
 * // Invalidate specific key
 * invalidateCache('user:123');
 * 
 * // Invalidate all user-related caches
 * invalidateCache(/^user:/);
 * ```
 */
export function invalidateCache(pattern: string | RegExp): void {
  const stats = cache.getStats();
  
  if (typeof pattern === "string") {
    cache.delete(pattern);
  } else {
    for (const key of stats.keys) {
      if (pattern.test(key)) {
        cache.delete(key);
      }
    }
  }
}
