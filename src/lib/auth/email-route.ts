import { createHash } from "node:crypto";
import { z } from "zod";
import { assertSameOrigin, CsrfError } from "@/lib/api/csrf";
import { createRateLimiter, getClientIp, type RateLimitResult } from "@/lib/rate-limit";
import { getEmailConfiguration } from "@/lib/email/config";
import { isEmailVerificationRequired, normalizedEmailSchema, registrationSchema, resendSchema, verificationSchema } from "./email-policy";
import { consumeEmailVerification, requestEmailVerification } from "./email-verification";

type Action = "register" | "resend" | "verify";
const confirmSchema = verificationSchema.extend({ email: normalizedEmailSchema });
const mailIpLimiter = createRateLimiter({ windowMs: 60 * 60_000, maxRequests: 10, keyGenerator: (ip) => `email:send:ip:${ip}` });
const mailEmailLimiter = createRateLimiter({ windowMs: 60 * 60_000, maxRequests: 3, keyGenerator: (hash) => `email:send:address:${hash}` });
const verifyIpLimiter = createRateLimiter({ windowMs: 15 * 60_000, maxRequests: 30, keyGenerator: (ip) => `email:verify:ip:${ip}` });
const verifyEmailLimiter = createRateLimiter({ windowMs: 15 * 60_000, maxRequests: 10, keyGenerator: (hash) => `email:verify:address:${hash}` });
const accepted = { message: "If verification is needed, check your email for instructions." };

class InputError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
}

function json(body: object, status: number, headers: Record<string, string> = {}) {
    return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function limited(result: RateLimitResult): Response | null {
    if (!result.limited) return null;
    return json({ error: "Too many requests" }, 429, { "Retry-After": String(Math.max(1, result.retryAfter)) });
}

async function readJson(request: Request): Promise<unknown> {
    const reader = request.body?.getReader();
    if (!reader) throw new InputError(400, "Invalid request");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 4096) {
                await reader.cancel();
                throw new InputError(413, "Request too large");
            }
            chunks.push(chunk.value);
        }
    } finally {
        reader.releaseLock();
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new InputError(400, "Invalid request"); }
}

function prepare(request: Request) {
    assertSameOrigin(request);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") throw new InputError(415, "Content-Type must be application/json");
    if (!isEmailVerificationRequired()) throw new InputError(404, "Not found");
    getEmailConfiguration();
}

type ParsedBody = { email: string; password?: string; token?: string };

async function complete(body: ParsedBody): Promise<Response> {
    if (body.token) {
        const valid = await consumeEmailVerification(body.token, body.email);
        return valid ? json({ message: "Email verified. You can now sign in." }, 200)
            : json({ error: "Invalid or expired verification link" }, 400);
    }
    await requestEmailVerification(body.email, body.password);
    return json(accepted, 202);
}

async function execute(action: Action, request: Request): Promise<Response> {
    const verifying = action === "verify";
    const ipLimit = await (verifying ? verifyIpLimiter : mailIpLimiter).check(getClientIp(request));
    const blockedIp = limited(ipLimit);
    if (blockedIp) return blockedIp;
    const schema = { register: registrationSchema, resend: resendSchema, verify: confirmSchema }[action];
    const body: ParsedBody = schema.parse(await readJson(request));
    const addressHash = createHash("sha256").update(body.email).digest("hex");
    const emailLimit = await (verifying ? verifyEmailLimiter : mailEmailLimiter).check(addressHash);
    return limited(emailLimit) ?? complete(body);
}

export function createEmailRoute(action: Action) {
    return async function POST(request: Request): Promise<Response> {
        try {
            prepare(request); // Must precede parsing, limits, authentication and writes.
            return await execute(action, request);
        } catch (error) {
            if (error instanceof CsrfError) return json({ error: "Forbidden" }, 403);
            if (error instanceof InputError) return json({ error: error.message }, error.status);
            if (error instanceof z.ZodError) return json({ error: "Invalid request" }, 400);
            // SMTP, DB, distributed limiter and configuration failures share one response.
            return json({ error: "Service unavailable" }, 503);
        }
    };
}
