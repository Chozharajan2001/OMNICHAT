// src/lib/alerting.ts
// Alerting system for monitoring and notifications
// For production, integrate with PagerDuty, Slack, email, or similar

interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  timestamp: number;
  source: string;
  labels?: Record<string, string>;
  acknowledged: boolean;
  resolved: boolean;
  resolvedAt?: number;
}

type AlertHandler = (alert: Alert) => Promise<void>;

class AlertManager {
  private alerts: Alert[] = [];
  private handlers: AlertHandler[] = [];
  private readonly maxAlerts = 1000; // Prevent unbounded growth
  private enabled = true;

  /**
   * Create a new alert
   * @param severity - Alert severity level
   * @param title - Alert title
   * @param message - Detailed alert message
   * @param source - Source of the alert (e.g., "health-check", "rate-limiter")
   * @param labels - Optional labels for categorization
   */
  async createAlert(
    severity: Alert["severity"],
    title: string,
    message: string,
    source: string,
    labels?: Record<string, string>
  ): Promise<Alert> {
    if (!this.enabled) {
      return {
        id: "",
        severity,
        title,
        message,
        timestamp: Date.now(),
        source,
        labels,
        acknowledged: false,
        resolved: false,
      };
    }

    const alert: Alert = {
      id: this.generateId(),
      severity,
      title,
      message,
      timestamp: Date.now(),
      source,
      labels,
      acknowledged: false,
      resolved: false,
    };

    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }

    // Notify all handlers
    await Promise.allSettled(this.handlers.map(handler => handler(alert)));

    return alert;
  }

  /**
   * Acknowledge an alert
   * @param alertId - Alert ID to acknowledge
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || alert.acknowledged) {
      return false;
    }

    alert.acknowledged = true;
    return true;
  }

  /**
   * Resolve an alert
   * @param alertId - Alert ID to resolve
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = Date.now();
    return true;
  }

  /**
   * Get all alerts
   * @param filter - Optional filter criteria
   */
  getAlerts(filter?: {
    severity?: Alert["severity"];
    acknowledged?: boolean;
    resolved?: boolean;
    source?: string;
  }): Alert[] {
    let filtered = [...this.alerts];

    if (filter) {
      if (filter.severity !== undefined) {
        filtered = filtered.filter(a => a.severity === filter.severity);
      }
      if (filter.acknowledged !== undefined) {
        filtered = filtered.filter(a => a.acknowledged === filter.acknowledged);
      }
      if (filter.resolved !== undefined) {
        filtered = filtered.filter(a => a.resolved === filter.resolved);
      }
      if (filter.source !== undefined) {
        filtered = filtered.filter(a => a.source === filter.source);
      }
    }

    return filtered;
  }

  /**
   * Get active (unresolved) alerts
   */
  getActiveAlerts(): Alert[] {
    return this.getAlerts({ resolved: false });
  }

  /**
   * Register an alert handler
   * @param handler - Function to call when alerts are created
   */
  registerHandler(handler: AlertHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Clear all alerts (for testing)
   */
  reset(): void {
    this.alerts = [];
    this.handlers = [];
  }

  /**
   * Enable or disable alerting
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if alerting is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private generateId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Global alert manager instance
 */
export const alertManager = new AlertManager();

/**
 * Pre-defined alert sources
 */
export const AlertSources = {
  HEALTH_CHECK: "health-check",
  RATE_LIMITER: "rate-limiter",
  AUTHENTICATION: "authentication",
  DATABASE: "database",
  CHAT_API: "chat-api",
  ENCRYPTION: "encryption",
} as const;

/**
 * Helper to create critical alerts
 */
export async function createCriticalAlert(
  title: string,
  message: string,
  source: string,
  labels?: Record<string, string>
): Promise<Alert> {
  return alertManager.createAlert("critical", title, message, source, labels);
}

/**
 * Helper to create warning alerts
 */
export async function createWarningAlert(
  title: string,
  message: string,
  source: string,
  labels?: Record<string, string>
): Promise<Alert> {
  return alertManager.createAlert("warning", title, message, source, labels);
}

/**
 * Helper to create info alerts
 */
export async function createInfoAlert(
  title: string,
  message: string,
  source: string,
  labels?: Record<string, string>
): Promise<Alert> {
  return alertManager.createAlert("info", title, message, source, labels);
}

/**
 * Console alert handler for development/debugging
 */
export function createConsoleHandler(): AlertHandler {
  return async (alert: Alert) => {
    const icon = alert.severity === "critical" ? "🔴" : alert.severity === "warning" ? "🟡" : "🔵";
    console.log(`${icon} [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`);
    if (alert.labels) {
      console.log(`   Labels: ${JSON.stringify(alert.labels)}`);
    }
    console.log(`   Source: ${alert.source} | Time: ${new Date(alert.timestamp).toISOString()}`);
  };
}
