import { NextResponse } from "next/server";

export class CsrfError extends Error {
    readonly status = 403;

    constructor() {
        super("Forbidden");
        this.name = "CsrfError";
    }
}

export class CsrfConfigurationError extends Error {
    readonly status = 503;

    constructor() {
        super("Service unavailable");
        this.name = "CsrfConfigurationError";
    }
}

export class UnsupportedMediaTypeError extends Error {
    readonly status = 415;

    constructor() {
        super("Content-Type must be application/json");
        this.name = "UnsupportedMediaTypeError";
    }
}

function parseHttpUrl(value: string): URL {
    // Reject inputs URL() would silently repair, including backslashes and spaces.
    if (!/^https?:\/\/[^/?#\\@]+(?:\/|$)/i.test(value) || /[\s\\?#\x00-\x1f\x7f]/.test(value)) {
        throw new CsrfConfigurationError();
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new CsrfConfigurationError();
    }
    if (url.username || url.password || url.search || url.hash || url.origin === "null") {
        throw new CsrfConfigurationError();
    }
    return url;
}

function isLoopback(hostname: string): boolean {
    return hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function expectedOrigin(request: Request): string {
    // An explicitly set but invalid APP_ORIGIN must not fall back to another value.
    const configured = process.env.APP_ORIGIN ?? process.env.NEXTAUTH_URL;
    if (configured !== undefined) {
        const url = parseHttpUrl(configured);
        // NEXTAUTH_URL may include the Auth.js base path; APP_ORIGIN is origin-only.
        if (process.env.APP_ORIGIN !== undefined && url.pathname !== "/") {
            throw new CsrfConfigurationError();
        }
        return url.origin;
    }
    if (process.env.NODE_ENV !== "development") {
        throw new CsrfConfigurationError();
    }
    // Paths and query strings do not affect the local request's origin.
    const url = parseHttpUrl(new URL(request.url).origin);
    if (!isLoopback(url.hostname)) {
        throw new CsrfConfigurationError();
    }
    return url.origin;
}

/** Call before auth, body parsing, rate consumption, or any other side effects. */
export function assertSameOrigin(request: Request): void {
    const expected = expectedOrigin(request);
    if (request.headers.get("sec-fetch-site")?.trim().toLowerCase() === "cross-site") {
        throw new CsrfError();
    }
    // Compare the serialized Origin verbatim: no paths, opaque origins, origin
    // lists, subdomains, alternate ports, Referer, Host, or forwarded fallbacks.
    if (request.headers.get("origin") !== expected) {
        throw new CsrfError();
    }
}

export function assertJsonContentType(request: Request): void {
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
        throw new UnsupportedMediaTypeError();
    }
}

/** Returns null for unrelated errors so existing route error handling can continue. */
export function getCsrfErrorStatus(error: unknown): 403 | 415 | 503 | null {
    if (error instanceof CsrfError) return 403;
    if (error instanceof UnsupportedMediaTypeError) return 415;
    if (error instanceof CsrfConfigurationError) return 503;
    return null;
}

export function getCsrfErrorResponse(error: unknown): NextResponse | null {
    const status = getCsrfErrorStatus(error);
    if (status === null) return null;
    const messages = {
        403: "Forbidden",
        415: "Content-Type must be application/json",
        503: "Service unavailable",
    };
    return NextResponse.json(
        { error: messages[status] },
        { status, headers: { "Cache-Control": "no-store" } },
    );
}

/** Early-return adapter for routes; DELETE callers need not supply a JSON body. */
export function guardMutationRequest(request: Request, requireJson = false): NextResponse | null {
    try {
        assertSameOrigin(request);
        if (requireJson) assertJsonContentType(request);
        return null;
    } catch (error: unknown) {
        const response = getCsrfErrorResponse(error);
        if (response) return response;
        throw error;
    }
}
