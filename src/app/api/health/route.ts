// src/app/api/health/route.ts
// Health check endpoint for monitoring and load balancers

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

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
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (encryptionKey && encryptionKey.length >= 32) {
      checks.encryption = "up";
    }
  } catch (error) {
    console.error("Health check: Encryption key check failed", error);
  }

  // Determine overall status
  const status: HealthStatus["status"] =
    checks.database === "down" || checks.encryption === "down"
      ? "unhealthy"
      : "healthy";

  const response: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    checks,
    version: process.env.npm_package_version || "0.1.0",
  };

  const httpStatus = status === "healthy" ? 200 : 503;

  return NextResponse.json(response, { status: httpStatus });
}
