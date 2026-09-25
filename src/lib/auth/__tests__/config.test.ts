import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
import type { authRateLimiter } from "@/lib/rate-limit";

const mocks = vi.hoisted(() => ({
    find: vi.fn(), rawQuery: vi.fn(), create: vi.fn(), compare: vi.fn(), hash: vi.fn(), auth: vi.fn(),
    ip: vi.fn(), configure: vi.fn(), adapterCreate: vi.fn(), adapterUpdate: vi.fn(),
    ipCheck: vi.fn<typeof authRateLimiter.check>(),
    emailCheck: vi.fn<typeof authRateLimiter.check>(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
    user: { findUnique: mocks.find, create: mocks.create },
    $queryRaw: mocks.rawQuery,
} }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));
vi.mock("next-auth", () => ({ default: () => ({ auth: mocks.auth }) }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({ createUser: mocks.adapterCreate, updateUser: mocks.adapterUpdate }) }));
vi.mock("@/lib/email/config", () => ({ getEmailConfiguration: mocks.configure }));
vi.mock("@/lib/rate-limit", () => ({
    authRateLimiter: { check: mocks.ipCheck },
    createRateLimiter: () => ({ check: mocks.emailCheck }), getClientIp: mocks.ip,
}));

import { authorizePassword, authConfig } from "../config";
import { getServerSession, requireAuth } from "../session";
import { requireAuth as requireApiAuth } from "@/lib/api/middleware";
import { validatePasswordComplexity } from "../email-policy";

const user = { id: "u1", email: "test@example.com", name: "Test", passwordHash: "hash", emailVerified: null as Date | null };
const credentials = { email: " TEST@example.com ", password: "Password1" };
const request = new Request("https://chat.example.com/api/auth/callback/credentials", {
    headers: { "x-forwarded-for": "spoofed, 192.0.2.1", "x-real-ip": "192.0.2.2" },
});
const allowed = { limited: false, remaining: 4, retryAfter: 0, resetTime: 0 };

type JwtArgs = Parameters<NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>>[0];
function jwt() {
    // Auth.js omits user on existing-token requests despite its callback type.
    return authConfig.callbacks.jwt({ token: { id: user.id, email: user.email }, trigger: "update", session: { emailVerified: true } } as unknown as JwtArgs);
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DESKTOP_MODE", undefined);
    mocks.find.mockResolvedValue(user);
    mocks.rawQuery.mockResolvedValue([]);
    mocks.create.mockResolvedValue(user);
    mocks.compare.mockResolvedValue(true);
    mocks.hash.mockResolvedValue("hash");
    mocks.ip.mockReturnValue("192.0.2.2");
    mocks.ipCheck.mockResolvedValue(allowed);
    mocks.emailCheck.mockResolvedValue(allowed);
    mocks.auth.mockResolvedValue({ user: { id: user.id, email: user.email }, expires: "2099-01-01" });
    mocks.adapterCreate.mockImplementation(async (data) => data);
    mocks.adapterUpdate.mockImplementation(async (data) => data);
});
afterEach(() => vi.unstubAllEnvs());

describe("credential authorization", () => {
    it("normalizes email and awaits both trusted-IP and email limits", async () => {
        mocks.find.mockResolvedValue({ ...user, emailVerified: new Date() });
        expect(await authorizePassword(credentials, request)).toEqual({ id: user.id, email: user.email, name: user.name });
        expect(mocks.ip).toHaveBeenCalledWith(request);
        expect(mocks.ipCheck).toHaveBeenCalledWith("192.0.2.2");
        expect(mocks.emailCheck).toHaveBeenCalledWith(user.email);
        expect(mocks.find).toHaveBeenCalledWith({ where: { email: user.email } });
    });

    it("resolves a legacy mixed-case email without creating or migrating an account", async () => {
        mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...user, email: "Test@Example.com", emailVerified: new Date() });
        mocks.rawQuery.mockResolvedValue([{ id: user.id }]);
        expect(await authorizePassword(credentials, request)).toEqual({ id: user.id, email: "Test@Example.com", name: user.name });
        expect(mocks.rawQuery).toHaveBeenCalledWith(expect.any(Array), user.email);
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it("fails closed if legacy normalized email matches multiple accounts", async () => {
        mocks.find.mockResolvedValue(null);
        mocks.rawQuery.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
        expect(await authorizePassword(credentials, request)).toBeNull();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it("does not distinguish wrong password, absent account and unverified account", async () => {
        expect(await authorizePassword(credentials, request)).toBeNull();
        mocks.compare.mockResolvedValue(false);
        expect(await authorizePassword(credentials, request)).toBeNull();
        mocks.find.mockResolvedValue(null);
        expect(await authorizePassword(credentials, request)).toBeNull();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it.each(["ipCheck", "emailCheck"] as const)("fails closed for async %s outage", async (name) => {
        mocks[name].mockRejectedValue(new Error("private backend configuration"));
        expect(await authorizePassword(credentials, request)).toBeNull();
        expect(mocks.find).not.toHaveBeenCalled();
    });

    it.each(["ipCheck", "emailCheck"] as const)("blocks on %s limit", async (name) => {
        mocks[name].mockResolvedValue({ ...allowed, limited: true });
        expect(await authorizePassword(credentials, request)).toBeNull();
        expect(mocks.find).not.toHaveBeenCalled();
    });

    it("fails closed on configuration or database errors", async () => {
        mocks.configure.mockImplementationOnce(() => { throw new Error("SMTP secret"); });
        expect(await authorizePassword(credentials, request)).toBeNull();
        mocks.find.mockRejectedValue(new Error("DB secret"));
        expect(await authorizePassword(credentials, request)).toBeNull();
    });

    it.each([{ email: 123, password: "Password1" }, { email: "invalid", password: "Password1" }, { email: user.email, password: {} }])("rejects malformed credentials %j", async (data) => {
        expect(await authorizePassword(data, request)).toBeNull();
        expect(mocks.find).not.toHaveBeenCalled();
    });

    it.each(["development", "production"])("strict true overrides local auto-creation in %s", async (mode) => {
        vi.stubEnv("NODE_ENV", mode);
        vi.stubEnv("DESKTOP_MODE", "true");
        mocks.find.mockResolvedValue(null);
        expect(await authorizePassword(credentials, request)).toBeNull();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it.each(["development", "production"])("preserves explicit local auto-creation with strict disabled in %s", async (mode) => {
        vi.stubEnv("NODE_ENV", mode);
        vi.stubEnv("DESKTOP_MODE", "true");
        vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "false");
        mocks.find.mockResolvedValue(null);
        expect(await authorizePassword(credentials, request)).not.toBeNull();
        expect(mocks.create).toHaveBeenCalledOnce();
        expect(mocks.configure).not.toHaveBeenCalled();
    });

    it("does not implicitly activate strict mode or create hosted accounts", async () => {
        vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", undefined);
        expect(await authorizePassword(credentials, request)).not.toBeNull();
        mocks.find.mockResolvedValue(null);
        expect(await authorizePassword(credentials, request)).toBeNull();
    });

    it.each(["Short1", "longer", "ALLCAPS1", "lowercase1", "NoNumbers", "Password1" + "a".repeat(64)])("rejects weak or bcrypt-truncated password %s", (password) => {
        expect(validatePasswordComplexity(password)).toBe(false);
    });
});

describe("old JWTs, OAuth, and server session enforcement", () => {
    it("rejects old JWTs even if the client submits a verified claim", async () => {
        expect(await jwt()).toBeNull();
    });

    it("requires own proof even on a newly issued OAuth JWT with a provider verification claim", async () => {
        const result = await authConfig.callbacks.jwt({
            token: { sub: user.id, email: user.email },
            user: { id: user.id, email: user.email, emailVerified: new Date() },
            trigger: "signIn",
        });
        expect(result).toBeNull();
    });

    it("checks the current DB state on every JWT access and honors revocation/deletion", async () => {
        mocks.find.mockResolvedValueOnce({ ...user, emailVerified: new Date() });
        expect(await jwt()).not.toBeNull();
        expect(await jwt()).toBeNull();
        mocks.find.mockResolvedValue(null);
        expect(await jwt()).toBeNull();
    });

    it("does not accept a JWT for a previous account email", async () => {
        mocks.find.mockResolvedValue({ ...user, email: "changed@example.com", emailVerified: new Date() });
        expect(await jwt()).toBeNull();
    });

    it("rechecks getServerSession and both requireAuth callers independently of JWT claims", async () => {
        expect(await getServerSession()).toBeNull();
        await expect(requireAuth()).rejects.toThrow("Unauthorized");
        await expect(requireApiAuth()).rejects.toThrow("Unauthorized");
        mocks.find.mockResolvedValueOnce({ ...user, emailVerified: new Date() });
        expect(await getServerSession()).not.toBeNull();
        expect(await getServerSession()).toBeNull();
    });

    it("fails closed on session, DB and configuration outages", async () => {
        mocks.find.mockRejectedValue(new Error("DB secret"));
        expect(await getServerSession()).toBeNull();
        expect(await jwt()).toBeNull();
        mocks.auth.mockRejectedValue(new Error("Auth secret"));
        await expect(requireAuth()).rejects.toThrow("Unauthorized");
    });

    it("does not require verification or query the database when disabled", async () => {
        vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "false");
        expect(await getServerSession()).not.toBeNull();
        expect(await jwt()).not.toBeNull();
        expect(mocks.find).not.toHaveBeenCalled();
    });

    it("never trusts provider-supplied verification on account creation or updates", async () => {
        await authConfig.adapter.createUser({ id: "u1", email: user.email, emailVerified: new Date() });
        expect(mocks.adapterCreate).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: null }));
        await authConfig.adapter.updateUser({ id: "u1", emailVerified: new Date() });
        expect(mocks.adapterUpdate).toHaveBeenCalledWith({ id: "u1" });
    });

    it("revokes verification when OAuth changes an account email", async () => {
        mocks.find.mockResolvedValue({ ...user, emailVerified: new Date() });
        await authConfig.adapter.updateUser({ id: "u1", email: "changed@example.com", emailVerified: new Date() });
        expect(mocks.adapterUpdate).toHaveBeenCalledWith({ id: "u1", email: "changed@example.com", emailVerified: null });
    });
});
