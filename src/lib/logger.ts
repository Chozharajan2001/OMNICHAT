// src/lib/logger.ts
// Structured logging with sensitive data redaction

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: Record<string, unknown>;
  correlationId?: string;
}

/**
 * Redact sensitive fields from log data
 */
function redactSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    "password",
    "apiKey",
    "api_key",
    "secret",
    "token",
    "authorization",
    "cookie",
    "session",
    "encryptedKey",
    "encryptionKey",
    "DATABASE_URL",
  ];

  const redacted: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Format log entry as JSON
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Create a logger instance with optional context
 */
export function createLogger(context?: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, correlationId?: string) => {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      correlationId,
    };

    if (data) {
      entry.data = redactSensitiveData(data);
    }

    const formatted = formatLogEntry(entry);

    switch (level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }
  };

  return {
    debug: (message: string, data?: Record<string, unknown>, correlationId?: string) =>
      log("debug", message, data, correlationId),
    info: (message: string, data?: Record<string, unknown>, correlationId?: string) =>
      log("info", message, data, correlationId),
    warn: (message: string, data?: Record<string, unknown>, correlationId?: string) =>
      log("warn", message, data, correlationId),
    error: (message: string, data?: Record<string, unknown>, correlationId?: string) =>
      log("error", message, data, correlationId),
  };
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
