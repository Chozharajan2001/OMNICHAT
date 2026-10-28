// src/lib/__tests__/metrics.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { metrics, MetricNames, recordHttpRequest, recordChatMessage, recordRateLimitRejection, recordAuthAttempt, recordBuildInfo } from "../metrics";

describe("MetricsCollector", () => {
  beforeEach(() => {
    metrics.reset();
  });

  describe("increment", () => {
    it("increments counter by 1 by default", () => {
      metrics.increment("test_counter");
      metrics.increment("test_counter");
      
      const series = metrics.getMetricsJSON().find(s => s.name === "test_counter");
      expect(series).toBeDefined();
      expect(series?.type).toBe("counter");
      expect(series?.values).toHaveLength(1);
      expect(series?.values[0].value).toBe(2);
    });

    it("increments counter by custom value", () => {
      metrics.increment("test_counter", undefined, 5);
      metrics.increment("test_counter", undefined, 3);
      
      const series = metrics.getMetricsJSON().find(s => s.name === "test_counter");
      expect(series?.values[0].value).toBe(8);
    });

    it("tracks separate counters for different label sets", () => {
      metrics.increment("test_counter", { method: "GET" });
      metrics.increment("test_counter", { method: "POST" });
      metrics.increment("test_counter", { method: "GET" });
      
      const series = metrics.getMetricsJSON().find(s => s.name === "test_counter");
      expect(series?.values).toHaveLength(2);
      
      const getMetric = series?.values.find(v => v.labels?.method === "GET");
      const postMetric = series?.values.find(v => v.labels?.method === "POST");
      
      expect(getMetric?.value).toBe(2);
      expect(postMetric?.value).toBe(1);
    });
  });

  describe("setGauge", () => {
    it("sets gauge value", () => {
      metrics.setGauge("memory_bytes", 1024);
      
      const series = metrics.getMetricsJSON().find(s => s.name === "memory_bytes");
      expect(series?.type).toBe("gauge");
      expect(series?.values[0].value).toBe(1024);
    });

    it("updates gauge value for same labels", () => {
      metrics.setGauge("memory_bytes", 1024, { region: "us-east" });
      metrics.setGauge("memory_bytes", 2048, { region: "us-east" });
      
      const series = metrics.getMetricsJSON().find(s => s.name === "memory_bytes");
      expect(series?.values).toHaveLength(1);
      expect(series?.values[0].value).toBe(2048);
    });

    it("tracks separate gauges for different labels", () => {
      metrics.setGauge("memory_bytes", 1024, { region: "us-east" });
      metrics.setGauge("memory_bytes", 2048, { region: "us-west" });
      
      const series = metrics.getMetricsJSON().find(s => s.name === "memory_bytes");
      expect(series?.values).toHaveLength(2);
    });
  });

  describe("observe", () => {
    it("records histogram observations", () => {
      metrics.observe("duration", 0.5);
      metrics.observe("duration", 1.2);
      metrics.observe("duration", 0.8);
      
      const series = metrics.getMetricsJSON().find(s => s.name === "duration");
      expect(series?.type).toBe("histogram");
      expect(series?.values).toHaveLength(3);
      expect(series?.values.map(v => v.value)).toEqual([0.5, 1.2, 0.8]);
    });

    it("enforces max series size", () => {
      for (let i = 0; i < 1100; i++) {
        metrics.observe("test_metric", i);
      }
      
      const series = metrics.getMetricsJSON().find(s => s.name === "test_metric");
      expect(series?.values.length).toBeLessThanOrEqual(1000);
    });
  });

  describe("getMetrics", () => {
    it("formats metrics in Prometheus-compatible format", () => {
      metrics.increment("http_requests_total", { method: "GET", status: "200" });
      metrics.setGauge("memory_bytes", 1024);
      
      const output = metrics.getMetrics();
      
      expect(output).toContain("# TYPE http_requests_total counter");
      expect(output).toContain('http_requests_total{method="GET",status="200"} 1');
      expect(output).toContain("# TYPE memory_bytes gauge");
      expect(output).toContain("memory_bytes 1024");
    });

    it("returns empty string when no metrics", () => {
      expect(metrics.getMetrics()).toBe("");
    });

    it("seeds build identity without faking traffic", () => {
      recordBuildInfo();
      const output = metrics.getMetrics();

      expect(output).toContain("# TYPE app_info gauge");
      expect(output).toMatch(/app_info\{version="[^"]+"\} 1/);
      expect(output).not.toContain("http_requests_total");
    });
  });

  describe("reset", () => {
    it("clears all metrics", () => {
      metrics.increment("test_counter");
      metrics.setGauge("test_gauge", 100);
      
      metrics.reset();
      
      expect(metrics.getMetricsJSON()).toHaveLength(0);
      expect(metrics.getMetrics()).toBe("");
    });
  });
});

describe("Helper functions", () => {
  beforeEach(() => {
    metrics.reset();
  });

  describe("recordHttpRequest", () => {
    it("records request count and duration", () => {
      recordHttpRequest("GET", "/api/conversations", 200, 150);
      
      const requests = metrics.getMetricsJSON().find(s => s.name === MetricNames.HTTP_REQUESTS_TOTAL);
      const duration = metrics.getMetricsJSON().find(s => s.name === MetricNames.HTTP_REQUEST_DURATION);
      
      expect(requests?.values).toHaveLength(1);
      expect(requests?.values[0].labels).toEqual({
        method: "GET",
        path: "/api/conversations",
        status: "200",
      });
      
      expect(duration?.values).toHaveLength(1);
      expect(duration?.values[0].value).toBe(0.15); // 150ms = 0.15s
    });

    it("records errors for 4xx and 5xx responses", () => {
      recordHttpRequest("POST", "/api/chat", 400, 50);
      recordHttpRequest("GET", "/api/health", 503, 10);
      
      const errors = metrics.getMetricsJSON().find(s => s.name === MetricNames.HTTP_ERRORS_TOTAL);
      expect(errors?.values).toHaveLength(2);
    });

    it("normalizes paths with IDs", () => {
      recordHttpRequest("GET", "/api/conversations/clx1234567890abcdefghijkl", 200, 100);
      
      const requests = metrics.getMetricsJSON().find(s => s.name === MetricNames.HTTP_REQUESTS_TOTAL);
      expect(requests?.values[0].labels?.path).toBe("/api/conversations/:id");
    });
  });

  describe("recordChatMessage", () => {
    it("records chat metrics with tokens and duration", () => {
      recordChatMessage("openai", "gpt-4o", 100, 50, 2000);
      
      const messages = metrics.getMetricsJSON().find(s => s.name === MetricNames.CHAT_MESSAGES_TOTAL);
      const tokens = metrics.getMetricsJSON().find(s => s.name === MetricNames.CHAT_TOKENS_TOTAL);
      const duration = metrics.getMetricsJSON().find(s => s.name === MetricNames.CHAT_DURATION);
      
      expect(messages?.values).toHaveLength(1);
      expect(messages?.values[0].labels).toEqual({ providerId: "openai", modelId: "gpt-4o" });
      
      expect(tokens?.values).toHaveLength(2); // input and output
      const inputTokens = tokens?.values.find(v => v.labels?.type === "input");
      const outputTokens = tokens?.values.find(v => v.labels?.type === "output");
      expect(inputTokens?.value).toBe(100);
      expect(outputTokens?.value).toBe(50);
      
      expect(duration?.values).toHaveLength(1);
      expect(duration?.values[0].value).toBe(2); // 2000ms = 2s
    });
  });

  describe("recordRateLimitRejection", () => {
    it("records rate limit rejections", () => {
      recordRateLimitRejection("/api/chat", "user123");
      recordRateLimitRejection("/api/chat", "user123");
      
      const rejections = metrics.getMetricsJSON().find(s => s.name === MetricNames.RATE_LIMIT_REJECTIONS);
      expect(rejections?.values).toHaveLength(1);
      expect(rejections?.values[0].value).toBe(2);
    });
  });

  describe("recordAuthAttempt", () => {
    it("records successful auth attempts", () => {
      recordAuthAttempt(true, "credentials");
      
      const attempts = metrics.getMetricsJSON().find(s => s.name === MetricNames.AUTH_ATTEMPTS);
      const failures = metrics.getMetricsJSON().find(s => s.name === MetricNames.AUTH_FAILURES);
      
      expect(attempts?.values).toHaveLength(1);
      expect(attempts?.values[0].value).toBe(1);
      expect(failures).toBeUndefined();
    });

    it("records failed auth attempts", () => {
      recordAuthAttempt(false, "credentials");
      
      const attempts = metrics.getMetricsJSON().find(s => s.name === MetricNames.AUTH_ATTEMPTS);
      const failures = metrics.getMetricsJSON().find(s => s.name === MetricNames.AUTH_FAILURES);
      
      expect(attempts?.values).toHaveLength(1);
      expect(attempts?.values[0].value).toBe(1);
      expect(failures?.values).toHaveLength(1);
      expect(failures?.values[0].value).toBe(1);
    });
  });
});
