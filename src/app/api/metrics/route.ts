// src/app/api/metrics/route.ts
// Metrics endpoint for monitoring systems (Prometheus, Grafana, etc.)
//
// Access control (audit M-metrics): this endpoint reveals operational data
// (traffic volumes, provider usage), so it is token-protected and fails
// closed in production:
// - METRICS_TOKEN set: requests must send `Authorization: Bearer <token>`.
// - METRICS_TOKEN unset in production: the endpoint does not exist (404).
// - Non-production (local dev): open, for debugging convenience.

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { metrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
    const token = process.env.METRICS_TOKEN;
    if (!token) {
        // Fail closed in production; open locally for debugging.
        return process.env.NODE_ENV !== "production";
    }
    const header = request.headers.get("authorization") ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
    const expected = Buffer.from(token, "utf8");
    const actual = Buffer.from(provided, "utf8");
    // timingSafeEqual throws on length mismatch; compare lengths first.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * GET /api/metrics
 * Returns application metrics in Prometheus-compatible format.
 * 404 (not 401/403) on failure so the surface is not advertised.
 */
export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return new NextResponse(null, { status: 404 });
    }

    const metricsText = metrics.getMetrics();

    return new NextResponse(metricsText, {
        status: 200,
        headers: {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}
