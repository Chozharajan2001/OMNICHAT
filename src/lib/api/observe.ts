import { createHash } from "node:crypto";
import { recordHttpRequest, recordRateLimitRejection } from "@/lib/metrics";

/**
 * Per-request HTTP accounting for Prometheus. Every API handler creates one at
 * the top and calls the returned `done` with the status at each exit. Plain
 * statements, no branches, so wiring it never moves a handler's complexity.
 * Failures here must never fail the request itself (a throw inside metrics
 * would turn a healthy 200 into a 500), hence the catch-and-drop.
 *
 * Deliberately NOT wired into /api/health (scrape-frequency noise) or
 * /api/metrics (self-observation feedback loop).
 */
export function routeTimer(method: string, route: string): (status: number) => void {
    const startedAt = Date.now();
    return (status: number) => {
        try {
            recordHttpRequest(method, route, status, Date.now() - startedAt);
        } catch {
            // Metrics are best-effort telemetry, never request logic.
        }
    };
}

/**
 * One line for every 429 a limiter emits. The user id is hashed: a raw id in
 * a label is unbounded cardinality and PII in a scrape endpoint.
 */
export function recordRejection(endpoint: string, userId: string): void {
    try {
        recordRateLimitRejection(
            endpoint,
            createHash("sha256").update(userId).digest("hex").slice(0, 16)
        );
    } catch {
        // Metrics are best-effort telemetry, never request logic.
    }
}
