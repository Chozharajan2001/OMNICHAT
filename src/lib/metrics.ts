// src/lib/metrics.ts
// Application metrics collection for monitoring and alerting
// For production, integrate with OpenTelemetry, Prometheus, or similar

import { APP_VERSION } from "@/lib/version";

interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

interface MetricSeries {
  name: string;
  type: "counter" | "gauge" | "histogram";
  values: MetricValue[];
  help?: string;
}

class MetricsCollector {
  private metrics = new Map<string, MetricSeries>();
  private readonly maxSeriesSize = 1000; // Prevent unbounded growth

  /**
   * Increment a counter metric
   * @param name - Metric name (e.g., "http_requests_total")
   * @param labels - Optional labels for dimensions (e.g., { method: "GET", status: "200" })
   * @param value - Increment value (default: 1)
   */
  increment(name: string, labels?: Record<string, string>, value = 1): void {
    this.recordCounter(name, value, labels);
  }

  /**
   * Set a gauge metric value
   * @param name - Metric name (e.g., "memory_usage_bytes")
   * @param value - Current value
   * @param labels - Optional labels
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const series = this.getOrCreateSeries(name, "gauge");
    
    // For gauges, keep only the latest value per label set
    const existing = series.values.findIndex(v => this.makeKey(name, v.labels) === key);
    if (existing >= 0) {
      series.values[existing] = { value, timestamp: Date.now(), labels };
    } else {
      series.values.push({ value, timestamp: Date.now(), labels });
      if (series.values.length > this.maxSeriesSize) {
        series.values.shift();
      }
    }
  }

  /**
   * Record a value in a histogram metric
   * @param name - Metric name (e.g., "http_request_duration_seconds")
   * @param value - Observed value
   * @param labels - Optional labels
   */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const series = this.getOrCreateSeries(name, "histogram");
    series.values.push({ value, timestamp: Date.now(), labels });
    
    // Keep only recent observations
    if (series.values.length > this.maxSeriesSize) {
      series.values.shift();
    }
  }

  /**
   * Get all metrics in Prometheus-compatible format
   */
  getMetrics(): string {
    const lines: string[] = [];
    
    for (const [name, series] of this.metrics.entries()) {
      if (series.help) {
        lines.push(`# HELP ${name} ${series.help}`);
      }
      lines.push(`# TYPE ${name} ${series.type}`);
      
      for (const metric of series.values) {
        const labels = metric.labels 
          ? `{${Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(",")}}`
          : "";
        lines.push(`${name}${labels} ${metric.value}`);
      }
    }
    
    return lines.join("\n");
  }

  /**
   * Get metrics as JSON for programmatic access
   */
  getMetricsJSON(): MetricSeries[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear all metrics (for testing)
   */
  reset(): void {
    this.metrics.clear();
  }

  private recordCounter(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const series = this.getOrCreateSeries(name, "counter");
    
    const existing = series.values.find(v => this.makeKey(name, v.labels) === key);
    if (existing) {
      existing.value += value;
      existing.timestamp = Date.now();
    } else {
      series.values.push({ value, timestamp: Date.now(), labels });
      if (series.values.length > this.maxSeriesSize) {
        series.values.shift();
      }
    }
  }

  private getOrCreateSeries(name: string, type: "counter" | "gauge" | "histogram"): MetricSeries {
    let series = this.metrics.get(name);
    if (!series) {
      series = { name, type, values: [] };
      this.metrics.set(name, series);
    }
    return series;
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return `${name}:${JSON.stringify(sorted)}`;
  }
}

/**
 * Global metrics instance.
 *
 * Anchored on the Node.js global scope, deliberately, not on module scope:
 * the standalone production bundle evaluates shared modules once per server
 * route, so a module-scoped singleton silently shards into one registry per
 * route and the scrape endpoint can never see another route's counters
 * (verified live: a booted container answered 401s on /api/providers and
 * /api/conversations yet scraped an empty registry, while the metrics route
 * showed only its own app_info seed, not the chat series the chat route had
 * just recorded). One process, one registry.
 */
const globalForMetrics = globalThis as unknown as { __omnichatMetrics?: MetricsCollector };

if (!globalForMetrics.__omnichatMetrics) {
    globalForMetrics.__omnichatMetrics = new MetricsCollector();
}

export const metrics: MetricsCollector = globalForMetrics.__omnichatMetrics;

/**
 * Build identity, recorded once at import so even an idle instance scrapes
 * something truthful: which build is answering, never traffic that has not
 * happened yet. Exported for tests; production calls it exactly once, below.
 */
export function recordBuildInfo(): void {
    metrics.setGauge("app_info", 1, { version: APP_VERSION });
}

recordBuildInfo();

/**
 * Pre-defined metric names for consistency
 */
export const MetricNames = {
  // HTTP metrics
  HTTP_REQUESTS_TOTAL: "http_requests_total",
  HTTP_REQUEST_DURATION: "http_request_duration_seconds",
  HTTP_ERRORS_TOTAL: "http_errors_total",
  
  // Rate limiting
  RATE_LIMIT_REJECTIONS: "rate_limit_rejections_total",
  
  // Authentication
  AUTH_ATTEMPTS: "auth_attempts_total",
  AUTH_FAILURES: "auth_failures_total",
  
  // Database
  DB_QUERIES_TOTAL: "db_queries_total",
  DB_QUERY_DURATION: "db_query_duration_seconds",
  DB_ERRORS_TOTAL: "db_errors_total",
  
  // AI/Chat
  CHAT_MESSAGES_TOTAL: "chat_messages_total",
  CHAT_TOKENS_TOTAL: "chat_tokens_total",
  CHAT_DURATION: "chat_duration_seconds",
  
  // System
  MEMORY_USAGE_BYTES: "memory_usage_bytes",
  ACTIVE_CONNECTIONS: "active_connections",
} as const;

/**
 * Helper to record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number
): void {
  metrics.increment(MetricNames.HTTP_REQUESTS_TOTAL, {
    method,
    path: normalizePath(path),
    status: String(status),
  });
  
  metrics.observe(MetricNames.HTTP_REQUEST_DURATION, durationMs / 1000, {
    method,
    path: normalizePath(path),
  });
  
  if (status >= 400) {
    metrics.increment(MetricNames.HTTP_ERRORS_TOTAL, {
      method,
      path: normalizePath(path),
      status: String(status),
    });
  }
}

/**
 * Helper to record rate limit rejections
 */
export function recordRateLimitRejection(endpoint: string, identifier: string): void {
  metrics.increment(MetricNames.RATE_LIMIT_REJECTIONS, { endpoint, identifier });
}

/**
 * Helper to record authentication attempts
 */
export function recordAuthAttempt(success: boolean, method: string): void {
  metrics.increment(MetricNames.AUTH_ATTEMPTS, { method });
  if (!success) {
    metrics.increment(MetricNames.AUTH_FAILURES, { method });
  }
}

/**
 * Helper to record chat message metrics
 */
export function recordChatMessage(
  providerId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  durationMs: number
): void {
  metrics.increment(MetricNames.CHAT_MESSAGES_TOTAL, { providerId, modelId });
  metrics.increment(MetricNames.CHAT_TOKENS_TOTAL, { providerId, modelId, type: "input" }, inputTokens);
  metrics.increment(MetricNames.CHAT_TOKENS_TOTAL, { providerId, modelId, type: "output" }, outputTokens);
  metrics.observe(MetricNames.CHAT_DURATION, durationMs / 1000, { providerId, modelId });
}

/**
 * Normalize request paths to reduce cardinality
 * Replace IDs with placeholders to avoid unique label combinations
 */
function normalizePath(path: string): string {
  // Replace UUIDs/CUIDs with placeholder
  const normalized = path.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "/:id"
  ).replace(/\/cl[0-9a-z]+/gi, "/:id");
  
  return normalized;
}
