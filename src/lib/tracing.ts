// src/lib/tracing.ts
// Distributed tracing for request flow tracking
// For production, integrate with OpenTelemetry, Jaeger, or Zipkin

interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

interface Span {
  context: SpanContext;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, string | number | boolean>;
  logs: Array<{ timestamp: number; message: string; fields?: Record<string, unknown> }>;
  status: "ok" | "error";
}

class Tracer {
  private spans: Span[] = [];
  private readonly maxSpans = 10000; // Prevent unbounded growth
  private enabled = true;

  /**
   * Start a new span
   * @param operationName - Name of the operation (e.g., "chat.request")
   * @param parentContext - Optional parent span context for linking
   * @returns Span context for passing to child operations
   */
  startSpan(operationName: string, parentContext?: SpanContext): SpanContext {
    if (!this.enabled) {
      return { traceId: "", spanId: "", parentSpanId: undefined };
    }

    const context: SpanContext = {
      traceId: parentContext?.traceId || this.generateId(32),
      spanId: this.generateId(16),
      parentSpanId: parentContext?.spanId,
    };

    const span: Span = {
      context,
      operationName,
      startTime: Date.now(),
      tags: {},
      logs: [],
      status: "ok",
    };

    this.spans.push(span);
    if (this.spans.length > this.maxSpans) {
      this.spans.shift();
    }

    return context;
  }

  /**
   * Finish a span and record its duration
   * @param context - Span context returned from startSpan
   * @param tags - Optional tags to add (e.g., { "http.status_code": 200 })
   * @param status - Span status (default: "ok")
   */
  finishSpan(
    context: SpanContext,
    tags?: Record<string, string | number | boolean>,
    status: "ok" | "error" = "ok"
  ): void {
    if (!this.enabled || !context.spanId) return;

    const span = this.spans.find(s => s.context.spanId === context.spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    if (tags) {
      Object.assign(span.tags, tags);
    }
  }

  /**
   * Add a log entry to a span
   * @param context - Span context
   * @param message - Log message
   * @param fields - Optional structured fields
   */
  log(
    context: SpanContext,
    message: string,
    fields?: Record<string, unknown>
  ): void {
    if (!this.enabled || !context.spanId) return;

    const span = this.spans.find(s => s.context.spanId === context.spanId);
    if (!span) return;

    span.logs.push({
      timestamp: Date.now(),
      message,
      fields,
    });
  }

  /**
   * Set a tag on a span
   * @param context - Span context
   * @param key - Tag key
   * @param value - Tag value
   */
  setTag(
    context: SpanContext,
    key: string,
    value: string | number | boolean
  ): void {
    if (!this.enabled || !context.spanId) return;

    const span = this.spans.find(s => s.context.spanId === context.spanId);
    if (!span) return;

    span.tags[key] = value;
  }

  /**
   * Get all spans for debugging/export
   */
  getSpans(): Span[] {
    return [...this.spans];
  }

  /**
   * Get spans in JSON format for export
   */
  exportSpans(): object {
    return {
      spans: this.spans.map(span => ({
        traceId: span.context.traceId,
        spanId: span.context.spanId,
        parentSpanId: span.context.parentSpanId,
        operationName: span.operationName,
        startTime: span.startTime,
        duration: span.duration,
        tags: span.tags,
        logs: span.logs,
        status: span.status,
      })),
    };
  }

  /**
   * Clear all spans (for testing)
   */
  reset(): void {
    this.spans = [];
  }

  /**
   * Enable or disable tracing
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if tracing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private generateId(length: number): string {
    const chars = "0123456789abcdef";
    let id = "";
    for (let i = 0; i < length; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }
}

/**
 * Global tracer instance
 */
export const tracer = new Tracer();

/**
 * Helper to trace async operations
 * @param operationName - Name of the operation
 * @param fn - Async function to trace
 * @param parentContext - Optional parent context
 * @returns The result of the function
 */
export async function traceAsync<T>(
  operationName: string,
  fn: (context: SpanContext) => Promise<T>,
  parentContext?: SpanContext
): Promise<T> {
  const context = tracer.startSpan(operationName, parentContext);
  
  try {
    const result = await fn(context);
    tracer.finishSpan(context, { "status.code": 200 }, "ok");
    return result;
  } catch (error) {
    tracer.finishSpan(
      context,
      {
        "status.code": 500,
        "error.message": error instanceof Error ? error.message : String(error),
      },
      "error"
    );
    tracer.log(context, "Operation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Common span operation names
 */
export const SpanOperations = {
  HTTP_REQUEST: "http.request",
  CHAT_REQUEST: "chat.request",
  DB_QUERY: "db.query",
  AI_PROVIDER_CALL: "ai.provider.call",
  ENCRYPTION: "encryption.operation",
  AUTH_CHECK: "auth.check",
} as const;
