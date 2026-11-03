// src/app/api/health/route.ts
// Health check endpoint for monitoring and load balancers

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    database: "up" | "down";
    encryption: "up" | "down";
  };
  version: string;
}

/**
 * GET /api/health
 * Returns application health status
 */
export async function GET(): Promise<NextResponse<HealthStatus>> {
  const checks: HealthStatus["checks"] = {
    database: "down",
    encryption: "down",
  };

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "up";
  } catch (error) {
    console.error("Health check: Database connection failed", error);
  }

  // Check encryption key availability
  try {
    const encryptionKey = process.env.ENCRYPTION_SECRET_KEY;
    if (encryptionKey && encryptionKey.length >= 32) {
      checks.encryption = "up";
    }
  } catch (error) {
    console.error("Health check: Encryption key check failed", error);
  }

  // Determine overall status (audit M-health): "degraded" is a real tier —
  // the database works but the vault cannot decrypt keys (UI serves, chat
  // breaks). Any non-healthy state still returns 503 for strict probes.
  const status: HealthStatus["status"] =
    checks.database === "down"
      ? "unhealthy"
      : checks.encryption === "down"
        ? "degraded"
        : "healthy";

  const response: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    checks,
    version: APP_VERSION,
  };

  const httpStatus = status === "healthy" ? 200 : 503;

  return NextResponse.json(response, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
