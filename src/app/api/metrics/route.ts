// src/app/api/metrics/route.ts
// Metrics endpoint for monitoring systems (Prometheus, Grafana, etc.)
// This endpoint should be protected in production and not exposed publicly

import { NextResponse } from "next/server";
import { metrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics
 * Returns application metrics in Prometheus-compatible format
 * 
 * Security: This endpoint should be protected via:
 * - Network-level access control (firewall, VPC)
 * - Authentication (API key, basic auth)
 * - Reverse proxy restrictions
 * 
 * Do not expose this endpoint to the public internet.
 */
export async function GET() {
  const metricsText = metrics.getMetrics();
  
  return new NextResponse(metricsText, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
