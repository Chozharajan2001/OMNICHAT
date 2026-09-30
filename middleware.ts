import { auth } from "@/lib/auth/config";

export default auth((req) => {
    const pathname = req.nextUrl.pathname.replace(/\/$/, "");
    const isAuthPage = ["/login", "/register", "/verify-email"].includes(pathname);
    const isApiAuthRoute = pathname === "/api/auth" || pathname.startsWith("/api/auth/");
    if (isApiAuthRoute || isAuthPage) return;

    // Auth's JWT callback rechecks database verification, including for old JWTs.
    if (req.auth?.user) return;
    if (pathname.startsWith("/api/")) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return Response.redirect(new URL("/login", req.nextUrl));
});

export const config = {
    runtime: "nodejs",
    matcher: [
        // Public outside the auth namespace: the readiness probe, and the exact
        // metrics path — a Prometheus scraper has no session, so /api/metrics is
        // gated solely by its own METRICS bearer token (fail-closed 404).
        "/((?!_next/static|_next/image|favicon.ico|api/auth(?:/|$)|api/health$|api/metrics$|icons).*)",
    ],
};
