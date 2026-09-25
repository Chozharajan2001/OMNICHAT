import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    assertJsonContentType,
    assertSameOrigin,
    CsrfConfigurationError,
    CsrfError,
    getCsrfErrorResponse,
    getCsrfErrorStatus,
    guardMutationRequest,
    UnsupportedMediaTypeError,
} from "./csrf";

const ORIGIN = "https://chat.example:8443";

function request(origin: string | null = ORIGIN, headers: HeadersInit = {}, url = "http://internal:3000/api/test") {
    const combined = new Headers(headers);
    if (origin !== null) combined.set("Origin", origin);
    return new Request(url, { method: "POST", headers: combined });
}

beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", ORIGIN);
    vi.stubEnv("NEXTAUTH_URL", undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("assertSameOrigin contract", () => {
    it("returns void for the public origin behind a proxy without trusting proxy headers", () => {
        expect(assertSameOrigin(request(ORIGIN, {
            Host: "attacker.example",
            "X-Forwarded-Host": "attacker.example",
            "X-Forwarded-Proto": "http",
            Forwarded: "host=attacker.example;proto=http",
        }))).toBeUndefined();
    });

    it.each([
        null, "null", "", "https://chat.example", "https://chat.example:8444",
        "http://chat.example:8443", "https://sub.chat.example:8443",
        "https://chat.example.attacker.test:8443", "https://CHAT.example:8443",
        "https://chat.example:8443/", "https://chat.example:8443/path",
        "https://chat.example:8443?query", "https://chat.example:8443#hash",
        "https://user:secret@chat.example:8443", "https://chat.example:8443 https://attacker.test",
        "https://chat.example:8443, https://attacker.test", "http://internal:3000",
        "file://chat.example", "data:text/plain,test", "https://[::1",
    ])("rejects a missing, opaque, malformed, or non-exact Origin: %s", (origin) => {
        const req = request(origin, { Referer: `${ORIGIN}/settings`, "Sec-Fetch-Site": "same-origin" });
        expect(() => assertSameOrigin(req)).toThrow(CsrfError);
        expect(guardMutationRequest(req)?.status).toBe(403);
    });

    it.each(["cross-site", "Cross-Site"])("rejects Sec-Fetch-Site %s even with matching Origin", (site) => {
        expect(() => assertSameOrigin(request(ORIGIN, { "Sec-Fetch-Site": site }))).toThrow(CsrfError);
    });

    it.each(["same-origin", "same-site", "none"])("accepts matching Origin with Sec-Fetch-Site %s", (site) => {
        expect(assertSameOrigin(request(ORIGIN, { "Sec-Fetch-Site": site }))).toBeUndefined();
    });

    it("never uses Host or forwarded headers to accept another origin", () => {
        expect(() => assertSameOrigin(request("https://attacker.test", {
            Host: "attacker.test", "X-Forwarded-Host": "attacker.test",
            "X-Forwarded-Proto": "https", Forwarded: "host=attacker.test;proto=https",
        }))).toThrow(CsrfError);
    });

    it("uses serialized default ports, not an alternate spelling from the Origin header", () => {
        vi.stubEnv("APP_ORIGIN", "https://chat.example:443/");
        expect(assertSameOrigin(request("https://chat.example"))).toBeUndefined();
        expect(() => assertSameOrigin(request("https://chat.example:443"))).toThrow(CsrfError);
    });
});

describe("canonical origin configuration", () => {
    it("gives APP_ORIGIN priority over NEXTAUTH_URL", () => {
        vi.stubEnv("NEXTAUTH_URL", "https://legacy.example/api/auth");
        expect(assertSameOrigin(request())).toBeUndefined();
        expect(() => assertSameOrigin(request("https://legacy.example"))).toThrow(CsrfError);
    });

    it("falls back to NEXTAUTH_URL's origin, including an Auth.js base path", () => {
        vi.stubEnv("APP_ORIGIN", undefined);
        vi.stubEnv("NEXTAUTH_URL", `${ORIGIN}/api/auth`);
        expect(assertSameOrigin(request())).toBeUndefined();
    });

    it.each([undefined, "", "not a url", "//chat.example", "https:///chat.example",
        "https://chat.example:invalid", "https://chat.example:65536", "https://[::1",
        "http:/chat.example", "file:///chat.example", "ftp://chat.example",
        "https://user:secret@chat.example", "https://@chat.example", "https://chat.example/path",
        "https://chat.example?secret=value", "https://chat.example/#secret",
        "https://chat.example/?", " https://chat.example", "https://chat.example\n",
        "https://chat.example\\path", "https://chat.example/\u0001",
    ])("fails closed in production for missing/malformed APP_ORIGIN: %s", (value) => {
        vi.stubEnv("APP_ORIGIN", value);
        expect(() => assertSameOrigin(request())).toThrow(CsrfConfigurationError);
        expect(guardMutationRequest(request())?.status).toBe(503);
    });

    it("does not hide malformed APP_ORIGIN behind a valid fallback", () => {
        vi.stubEnv("APP_ORIGIN", "");
        vi.stubEnv("NEXTAUTH_URL", ORIGIN);
        expect(() => assertSameOrigin(request())).toThrow(CsrfConfigurationError);
    });

    it("fails closed for malformed NEXTAUTH_URL", () => {
        vi.stubEnv("APP_ORIGIN", undefined);
        vi.stubEnv("NEXTAUTH_URL", "not-a-url");
        expect(() => assertSameOrigin(request())).toThrow(CsrfConfigurationError);
    });

    it("does not allow production loopback without configuration", () => {
        vi.stubEnv("APP_ORIGIN", undefined);
        expect(() => assertSameOrigin(request("http://localhost:3000", {}, "http://localhost:3000/api/test")))
            .toThrow(CsrfConfigurationError);
    });
});

describe("unconfigured local development", () => {
    beforeEach(() => {
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("APP_ORIGIN", undefined);
    });

    it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.2:4321", "http://[::1]:3000"])(
        "allows only the exact loopback request URL origin: %s", (origin) => {
            expect(assertSameOrigin(request(origin, {}, `${origin}/api/test`))).toBeUndefined();
            expect(() => assertSameOrigin(request("http://localhost:9999", {}, `${origin}/api/test`)))
                .toThrow(CsrfError);
        },
    );

    it.each(["https://attacker.test", "http://localhost.attacker.test", "http://192.168.1.1", "http://0.0.0.0"])(
        "rejects non-loopback request URL %s regardless of forwarded headers", (origin) => {
            expect(() => assertSameOrigin(request(origin, {
                Host: "localhost", "X-Forwarded-Host": "localhost", "X-Forwarded-Proto": "http",
            }, `${origin}/api/test`))).toThrow(CsrfConfigurationError);
        },
    );

    it("ignores the path and query string of a loopback request URL", () => {
        expect(assertSameOrigin(request("http://localhost:3000", {}, "http://localhost:3000/api/test?mode=local")))
            .toBeUndefined();
    });

    it("does not fall back to loopback after malformed configuration", () => {
        vi.stubEnv("APP_ORIGIN", "malformed");
        expect(() => assertSameOrigin(request("http://localhost", {}, "http://localhost/api/test")))
            .toThrow(CsrfConfigurationError);
    });

    it("requires explicit configuration in test mode too", () => {
        vi.stubEnv("NODE_ENV", "test");
        expect(() => assertSameOrigin(request("http://localhost", {}, "http://localhost/api/test")))
            .toThrow(CsrfConfigurationError);
    });
});

describe("JSON media gate and safe responses", () => {
    it.each(["application/json", "application/json; charset=utf-8", "Application/JSON; Charset=UTF-8"])(
        "accepts %s without parsing the body", (contentType) => {
            const req = request(ORIGIN, { "Content-Type": contentType });
            expect(assertJsonContentType(req)).toBeUndefined();
            expect(guardMutationRequest(req, true)).toBeNull();
            expect(req.bodyUsed).toBe(false);
        },
    );

    it.each([null, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/problem+json", "application/jsonp"])(
        "rejects unsupported content type %s", (contentType) => {
            const req = request();
            if (contentType !== null) req.headers.set("Content-Type", contentType);
            expect(() => assertJsonContentType(req)).toThrow(UnsupportedMediaTypeError);
            expect(guardMutationRequest(req, true)?.status).toBe(415);
        },
    );

    it("allows a bodyless DELETE without Content-Type", () => {
        const req = new Request(`${ORIGIN}/api/test`, { method: "DELETE", headers: { Origin: ORIGIN } });
        expect(guardMutationRequest(req)).toBeNull();
    });

    it("checks CSRF before media type", () => {
        expect(guardMutationRequest(request(null), true)?.status).toBe(403);
    });

    it.each([
        { error: new CsrfError(), status: 403, message: "Forbidden" },
        { error: new CsrfConfigurationError(), status: 503, message: "Service unavailable" },
        { error: new UnsupportedMediaTypeError(), status: 415, message: "Content-Type must be application/json" },
    ])("maps typed errors to safe $status responses", async ({ error, status, message }) => {
        expect(error.status).toBe(status);
        error.message = "internal secret must not escape";
        const response = getCsrfErrorResponse(error)!;
        expect(getCsrfErrorStatus(error)).toBe(status);
        expect(response.status).toBe(status);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toEqual({ error: message });
    });

    it.each([undefined, null, new Error("secret"), { status: 403, message: "secret" }])(
        "does not misclassify unknown errors %s", (error) => {
            expect(getCsrfErrorStatus(error)).toBeNull();
            expect(getCsrfErrorResponse(error)).toBeNull();
        },
    );

    it("does not swallow unexpected guard errors", () => {
        const req = request();
        const error = new Error("unexpected request failure");
        vi.spyOn(req.headers, "get").mockImplementation(() => { throw error; });
        expect(() => guardMutationRequest(req)).toThrow(error);
    });
});
