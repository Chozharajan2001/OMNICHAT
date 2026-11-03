// src/lib/__tests__/alerting.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  alertManager,
  createCriticalAlert,
  createWarningAlert,
  createInfoAlert,
  createConsoleHandler,
  AlertSources,
} from "../alerting";

describe("AlertManager", () => {
  beforeEach(() => {
    alertManager.reset();
    alertManager.setEnabled(true);
  });

  describe("createAlert", () => {
    it("creates a new alert with all fields", async () => {
      const alert = await alertManager.createAlert(
        "critical",
        "Database Down",
        "Cannot connect to database",
        AlertSources.DATABASE,
        { region: "us-east" }
      );

      expect(alert.id).toBeDefined();
      expect(alert.severity).toBe("critical");
      expect(alert.title).toBe("Database Down");
      expect(alert.message).toBe("Cannot connect to database");
      expect(alert.source).toBe("database");
      expect(alert.labels).toEqual({ region: "us-east" });
      expect(alert.acknowledged).toBe(false);
      expect(alert.resolved).toBe(false);
      expect(alert.timestamp).toBeGreaterThan(0);
    });

    it("stores alerts in order", async () => {
      await alertManager.createAlert("info", "First", "Message 1", "test");
      await alertManager.createAlert("warning", "Second", "Message 2", "test");
      await alertManager.createAlert("critical", "Third", "Message 3", "test");

      const alerts = alertManager.getAlerts();
      expect(alerts).toHaveLength(3);
      expect(alerts[0].title).toBe("First");
      expect(alerts[1].title).toBe("Second");
      expect(alerts[2].title).toBe("Third");
    });

    it("enforces maximum alert limit", async () => {
      for (let i = 0; i < 1005; i++) {
        await alertManager.createAlert("info", `Alert ${i}`, `Message ${i}`, "test");
      }

      const alerts = alertManager.getAlerts();
      expect(alerts.length).toBeLessThanOrEqual(1000);
    });

    it("returns dummy alert when disabled", async () => {
      alertManager.setEnabled(false);
      const alert = await alertManager.createAlert("critical", "Test", "Message", "test");

      expect(alert.id).toBe("");
      expect(alertManager.getAlerts()).toHaveLength(0);
    });
  });

  describe("acknowledgeAlert", () => {
    it("acknowledges an existing alert", async () => {
      const alert = await alertManager.createAlert("warning", "Test", "Message", "test");
      
      const result = alertManager.acknowledgeAlert(alert.id);
      
      expect(result).toBe(true);
      
      const updated = alertManager.getAlerts().find(a => a.id === alert.id);
      expect(updated?.acknowledged).toBe(true);
    });

    it("returns false for non-existent alert", () => {
      const result = alertManager.acknowledgeAlert("non-existent-id");
      expect(result).toBe(false);
    });

    it("returns false for already acknowledged alert", async () => {
      const alert = await alertManager.createAlert("warning", "Test", "Message", "test");
      alertManager.acknowledgeAlert(alert.id);
      
      const result = alertManager.acknowledgeAlert(alert.id);
      expect(result).toBe(false);
    });
  });

  describe("resolveAlert", () => {
    it("resolves an existing alert", async () => {
      const alert = await alertManager.createAlert("critical", "Test", "Message", "test");
      
      const result = alertManager.resolveAlert(alert.id);
      
      expect(result).toBe(true);
      
      const updated = alertManager.getAlerts().find(a => a.id === alert.id);
      expect(updated?.resolved).toBe(true);
      expect(updated?.resolvedAt).toBeGreaterThan(0);
    });

    it("returns false for non-existent alert", () => {
      const result = alertManager.resolveAlert("non-existent-id");
      expect(result).toBe(false);
    });

    it("returns false for already resolved alert", async () => {
      const alert = await alertManager.createAlert("critical", "Test", "Message", "test");
      alertManager.resolveAlert(alert.id);
      
      const result = alertManager.resolveAlert(alert.id);
      expect(result).toBe(false);
    });
  });

  describe("getAlerts", () => {
    it("filters by severity", async () => {
      await alertManager.createAlert("info", "Info", "Message", "test");
      await alertManager.createAlert("warning", "Warning", "Message", "test");
      await alertManager.createAlert("critical", "Critical", "Message", "test");

      const critical = alertManager.getAlerts({ severity: "critical" });
      expect(critical).toHaveLength(1);
      expect(critical[0].title).toBe("Critical");
    });

    it("filters by acknowledged status", async () => {
      const alert1 = await alertManager.createAlert("warning", "Alert 1", "Message", "test");
      await alertManager.createAlert("warning", "Alert 2", "Message", "test");
      alertManager.acknowledgeAlert(alert1.id);

      const acknowledged = alertManager.getAlerts({ acknowledged: true });
      const unacknowledged = alertManager.getAlerts({ acknowledged: false });

      expect(acknowledged).toHaveLength(1);
      expect(unacknowledged).toHaveLength(1);
    });

    it("filters by resolved status", async () => {
      const alert1 = await alertManager.createAlert("warning", "Alert 1", "Message", "test");
      await alertManager.createAlert("warning", "Alert 2", "Message", "test");
      alertManager.resolveAlert(alert1.id);

      const resolved = alertManager.getAlerts({ resolved: true });
      const unresolved = alertManager.getAlerts({ resolved: false });

      expect(resolved).toHaveLength(1);
      expect(unresolved).toHaveLength(1);
    });

    it("filters by source", async () => {
      await alertManager.createAlert("warning", "DB", "Message", AlertSources.DATABASE);
      await alertManager.createAlert("warning", "Auth", "Message", AlertSources.AUTHENTICATION);

      const dbAlerts = alertManager.getAlerts({ source: AlertSources.DATABASE });
      expect(dbAlerts).toHaveLength(1);
      expect(dbAlerts[0].source).toBe("database");
    });

    it("combines multiple filters", async () => {
      await alertManager.createAlert("critical", "DB Critical", "Message", AlertSources.DATABASE);
      await alertManager.createAlert("warning", "DB Warning", "Message", AlertSources.DATABASE);
      await alertManager.createAlert("critical", "Auth Critical", "Message", AlertSources.AUTHENTICATION);

      const filtered = alertManager.getAlerts({
        severity: "critical",
        source: AlertSources.DATABASE,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe("DB Critical");
    });
  });

  describe("getActiveAlerts", () => {
    it("returns only unresolved alerts", async () => {
      const alert1 = await alertManager.createAlert("critical", "Active", "Message", "test");
      const alert2 = await alertManager.createAlert("warning", "Resolved", "Message", "test");
      alertManager.resolveAlert(alert2.id);

      const active = alertManager.getActiveAlerts();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(alert1.id);
    });
  });

  describe("registerHandler", () => {
    it("calls handlers when alerts are created", async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      alertManager.registerHandler(handler1);
      alertManager.registerHandler(handler2);

      const alert = await alertManager.createAlert("critical", "Test", "Message", "test");

      expect(handler1).toHaveBeenCalledExactlyOnceWith(alert);
      expect(handler2).toHaveBeenCalledExactlyOnceWith(alert);
    });

    it("continues even if handler fails", async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error("Handler error"));
      const successHandler = vi.fn().mockResolvedValue(undefined);

      alertManager.registerHandler(failingHandler);
      alertManager.registerHandler(successHandler);

      await alertManager.createAlert("critical", "Test", "Message", "test");

      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("reset", () => {
    it("clears all alerts and handlers", async () => {
      const handler = vi.fn();
      
      await alertManager.createAlert("critical", "Test", "Message", "test");
      alertManager.registerHandler(handler);

      alertManager.reset();

      expect(alertManager.getAlerts()).toHaveLength(0);
      
      await alertManager.createAlert("warning", "Test 2", "Message 2", "test");
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe("Helper functions", () => {
  beforeEach(() => {
    alertManager.reset();
    alertManager.setEnabled(true);
  });

  describe("createCriticalAlert", () => {
    it("creates critical severity alert", async () => {
      const alert = await createCriticalAlert("Critical Issue", "Details", "test");
      expect(alert.severity).toBe("critical");
    });
  });

  describe("createWarningAlert", () => {
    it("creates warning severity alert", async () => {
      const alert = await createWarningAlert("Warning Issue", "Details", "test");
      expect(alert.severity).toBe("warning");
    });
  });

  describe("createInfoAlert", () => {
    it("creates info severity alert", async () => {
      const alert = await createInfoAlert("Info Issue", "Details", "test");
      expect(alert.severity).toBe("info");
    });
  });
});

describe("AlertSources constants", () => {
  it("defines common alert sources", () => {
    expect(AlertSources.HEALTH_CHECK).toBe("health-check");
    expect(AlertSources.RATE_LIMITER).toBe("rate-limiter");
    expect(AlertSources.AUTHENTICATION).toBe("authentication");
    expect(AlertSources.DATABASE).toBe("database");
    expect(AlertSources.CHAT_API).toBe("chat-api");
    expect(AlertSources.ENCRYPTION).toBe("encryption");
  });
});

describe("createConsoleHandler", () => {
  it("logs alerts to console", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const handler = createConsoleHandler();

    const alert = await alertManager.createAlert("critical", "Test Alert", "Test message", "test", { key: "value" });
    await handler(alert);

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    expect(logCall).toContain("🔴");
    expect(logCall).toContain("CRITICAL");
    expect(logCall).toContain("Test Alert");
    expect(logCall).toContain("Test message");

    consoleSpy.mockRestore();
  });
});
