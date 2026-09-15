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
 * Simple in-memory cache with TTL support
 * For production, consider using Redis for distributed caching
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
   * Get cached data if it exists and hasn't expired
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
   * Set cached data with TTL
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
 * Cache wrapper function for async operations
 * Implements cache-aside pattern
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
