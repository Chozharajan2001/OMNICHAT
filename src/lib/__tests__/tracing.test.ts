// src/lib/__tests__/tracing.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { tracer, traceAsync, SpanOperations } from "../tracing";

describe("Tracer", () => {
  beforeEach(() => {
    tracer.reset();
    tracer.setEnabled(true);
  });

  describe("startSpan", () => {
    it("creates a new span with unique IDs", () => {
      const context = tracer.startSpan("test.operation");
      
      expect(context.traceId).toHaveLength(32);
      expect(context.spanId).toHaveLength(16);
      expect(context.parentSpanId).toBeUndefined();
    });

    it("creates child spans with parent context", () => {
      const parent = tracer.startSpan("parent.operation");
      const child = tracer.startSpan("child.operation", parent);
      
      expect(child.traceId).toBe(parent.traceId);
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.spanId).not.toBe(parent.spanId);
    });

    it("returns empty context when disabled", () => {
      tracer.setEnabled(false);
      const context = tracer.startSpan("test.operation");
      
      expect(context.traceId).toBe("");
      expect(context.spanId).toBe("");
    });
  });

  describe("finishSpan", () => {
    it("records span duration and status", () => {
      const context = tracer.startSpan("test.operation");
      
      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) { /* busy wait */ }
      
      tracer.finishSpan(context, { "http.status": 200 }, "ok");
      
      const spans = tracer.getSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].duration).toBeGreaterThanOrEqual(10);
      expect(spans[0].status).toBe("ok");
      expect(spans[0].tags["http.status"]).toBe(200);
    });

    it("marks spans as error when specified", () => {
      const context = tracer.startSpan("test.operation");
      tracer.finishSpan(context, { "error.message": "Something failed" }, "error");
      
      const spans = tracer.getSpans();
      expect(spans[0].status).toBe("error");
    });

    it("does nothing when disabled", () => {
      const context = tracer.startSpan("test.operation");
      tracer.setEnabled(false);
      tracer.finishSpan(context);
      
      const spans = tracer.getSpans();
      expect(spans[0].endTime).toBeUndefined();
    });
  });

  describe("log", () => {
    it("adds log entries to spans", () => {
      const context = tracer.startSpan("test.operation");
      tracer.log(context, "Starting processing", { step: 1 });
      tracer.log(context, "Completed processing", { step: 2, result: "success" });
      
      const spans = tracer.getSpans();
      expect(spans[0].logs).toHaveLength(2);
      expect(spans[0].logs[0].message).toBe("Starting processing");
      expect(spans[0].logs[0].fields).toEqual({ step: 1 });
      expect(spans[0].logs[1].message).toBe("Completed processing");
    });

    it("does nothing when disabled", () => {
      const context = tracer.startSpan("test.operation");
      tracer.setEnabled(false);
      tracer.log(context, "This should not be logged");
      
      const spans = tracer.getSpans();
      expect(spans[0].logs).toHaveLength(0);
    });
  });

  describe("setTag", () => {
    it("adds tags to spans", () => {
      const context = tracer.startSpan("test.operation");
      tracer.setTag(context, "user.id", "user123");
      tracer.setTag(context, "request.size", 1024);
      tracer.setTag(context, "cached", true);
      
      const spans = tracer.getSpans();
      expect(spans[0].tags["user.id"]).toBe("user123");
      expect(spans[0].tags["request.size"]).toBe(1024);
      expect(spans[0].tags["cached"]).toBe(true);
    });
  });

  describe("exportSpans", () => {
    it("exports spans in JSON format", () => {
      const context = tracer.startSpan("test.operation");
      tracer.setTag(context, "key", "value");
      tracer.log(context, "Test log");
      tracer.finishSpan(context);
      
      const exported = tracer.exportSpans();
      expect(exported).toHaveProperty("spans");
      expect(Array.isArray((exported as any).spans)).toBe(true);
      expect((exported as any).spans).toHaveLength(1);
      
      const span = (exported as any).spans[0];
      expect(span).toHaveProperty("traceId");
      expect(span).toHaveProperty("spanId");
      expect(span).toHaveProperty("operationName", "test.operation");
      expect(span).toHaveProperty("duration");
      expect(span).toHaveProperty("tags");
      expect(span).toHaveProperty("logs");
    });
  });

  describe("reset", () => {
    it("clears all spans", () => {
      tracer.startSpan("operation1");
      tracer.startSpan("operation2");
      
      expect(tracer.getSpans()).toHaveLength(2);
      
      tracer.reset();
      
      expect(tracer.getSpans()).toHaveLength(0);
    });
  });

  describe("max spans limit", () => {
    it("enforces maximum span limit", () => {
      for (let i = 0; i < 10005; i++) {
        tracer.startSpan(`operation.${i}`);
      }
      
      const spans = tracer.getSpans();
      expect(spans.length).toBeLessThanOrEqual(10000);
    });
  });
});

describe("traceAsync", () => {
  beforeEach(() => {
    tracer.reset();
    tracer.setEnabled(true);
  });

  it("traces successful async operations", async () => {
    const result = await traceAsync("test.async", async (context) => {
      expect(context.spanId).toBeDefined();
      tracer.log(context, "Inside async operation");
      return "success";
    });
    
    expect(result).toBe("success");
    
    const spans = tracer.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].operationName).toBe("test.async");
    expect(spans[0].status).toBe("ok");
    expect(spans[0].logs).toHaveLength(1);
  });

  it("traces failed async operations", async () => {
    const error = new Error("Test error");
    
    await expect(
      traceAsync("test.async.error", async (context) => {
        tracer.log(context, "About to fail");
        throw error;
      })
    ).rejects.toThrow("Test error");
    
    const spans = tracer.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status).toBe("error");
    expect(spans[0].tags["error.message"]).toBe("Test error");
    expect(spans[0].logs).toHaveLength(2);
  });

  it("supports parent context", async () => {
    const parent = tracer.startSpan("parent.operation");
    
    await traceAsync("child.operation", async (context) => {
      expect(context.traceId).toBe(parent.traceId);
      expect(context.parentSpanId).toBe(parent.spanId);
      return "child result";
    }, parent);
    
    const spans = tracer.getSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0].context.traceId).toBe(parent.traceId);
    expect(spans[1].context.traceId).toBe(parent.traceId);
    expect(spans[1].context.parentSpanId).toBe(parent.spanId);
  });
});

describe("SpanOperations constants", () => {
  it("defines common operation names", () => {
    expect(SpanOperations.HTTP_REQUEST).toBe("http.request");
    expect(SpanOperations.CHAT_REQUEST).toBe("chat.request");
    expect(SpanOperations.DB_QUERY).toBe("db.query");
    expect(SpanOperations.AI_PROVIDER_CALL).toBe("ai.provider.call");
    expect(SpanOperations.ENCRYPTION).toBe("encryption.operation");
    expect(SpanOperations.AUTH_CHECK).toBe("auth.check");
  });
});
