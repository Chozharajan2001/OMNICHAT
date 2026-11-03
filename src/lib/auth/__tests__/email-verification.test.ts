import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, User, VerificationToken } from "@prisma/client";

const mocks = vi.hoisted(() => ({
    findUser: vi.fn(), upsert: vi.fn(), createToken: vi.fn(), deleteTokens: vi.fn(),
    findToken: vi.fn(), updateUser: vi.fn(), transaction: vi.fn(),
    send: vi.fn(), config: vi.fn(), hash: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
    user: { findUnique: mocks.findUser, upsert: mocks.upsert },
    verificationToken: { create: mocks.createToken, deleteMany: mocks.deleteTokens },
    $queryRaw: async () => [],
    $transaction: mocks.transaction,
} }));
vi.mock("@/lib/email/config", () => ({ getEmailConfiguration: mocks.config }));
vi.mock("@/lib/email/smtp", () => ({ sendVerificationEmail: mocks.send }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));

import { consumeEmailVerification, hashVerificationToken, requestEmailVerification } from "../email-verification";

const user = { id: "u1", email: "test@example.com", emailVerified: null };
const raw = "a".repeat(64);
let tokens: Map<string, VerificationToken>;
let verified: Date | null;

function seedToken(token = raw, expires = new Date(Date.now() + 60_000)) {
    const record = {
        token: hashVerificationToken(token),
        identifier: 'email-verification:v1:["u1","test@example.com"]',
        expires,
    };
    tokens.set(record.token, record);
    return record;
}

function deleteMatching(args: Prisma.VerificationTokenDeleteManyArgs) {
    let count = 0;
    const where = args.where!;
    for (const [key, record] of tokens) {
        if (where.token && where.token !== key) continue;
        if (where.identifier && where.identifier !== record.identifier) continue;
        const expiry = where.expires as Prisma.DateTimeFilter | undefined;
        if (expiry?.gt && record.expires <= new Date(expiry.gt as Date)) continue;
        if (expiry?.lte && record.expires > new Date(expiry.lte as Date)) continue;
        tokens.delete(key);
        count++;
    }
    return { count };
}

beforeEach(() => {
    vi.resetAllMocks();
    tokens = new Map();
    verified = null;
    mocks.findUser.mockResolvedValue(user);
    mocks.upsert.mockResolvedValue(user);
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.send.mockResolvedValue(undefined);
    mocks.createToken.mockImplementation(({ data }) => {
        tokens.set(data.token, data);
        return Promise.resolve(data);
    });
    mocks.deleteTokens.mockImplementation(async (args) => deleteMatching(args));
    mocks.findToken.mockImplementation(async ({ where }) => tokens.get(where.token) ?? null);
    mocks.updateUser.mockImplementation(async () => {
        if (verified) return { count: 0 };
        verified = new Date();
        return { count: 1 };
    });
    const tx = {
        verificationToken: { findUnique: mocks.findToken, deleteMany: mocks.deleteTokens },
        user: { updateMany: mocks.updateUser },
    };
    mocks.transaction.mockImplementation(async (callback) => {
        const snapshot = new Map(tokens);
        try { return await callback(tx); }
        catch (error) { tokens = snapshot; throw error; }
    });
});
afterEach(() => vi.restoreAllMocks());

describe("verification issuance", () => {
    it("stores only a purpose-bound digest with a 30-minute expiry", async () => {
        const start = Date.now();
        await requestEmailVerification(user.email);
        const rawToken = mocks.send.mock.calls[0][1];
        expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
        const record = [...tokens.values()][0];
        expect(record.token).not.toBe(rawToken);
        expect(record.token).toBe(hashVerificationToken(rawToken));
        expect(record.identifier).toContain(user.id);
        expect(record.expires.getTime() - start).toBeGreaterThanOrEqual(30 * 60_000);
        expect(record.expires.getTime() - start).toBeLessThan(30 * 60_000 + 1000);
    });

    it("checks configuration before any side effects", async () => {
        mocks.config.mockImplementation(() => { throw new Error("Unavailable"); });
        await expect(requestEmailVerification(user.email, "Password1")).rejects.toThrow("Unavailable");
        expect(mocks.findUser).not.toHaveBeenCalled();
        expect(mocks.hash).not.toHaveBeenCalled();
    });

    it("creates a password account without setting verification and preserves duplicate passwords", async () => {
        mocks.findUser.mockResolvedValueOnce(null);
        await requestEmailVerification(user.email, "Password1");
        expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({ emailVerified: null, passwordHash: "hashed-password" }),
            update: {},
        }));
        await requestEmailVerification(user.email, "Different1");
        expect(mocks.upsert).toHaveBeenCalledTimes(1);
        expect(mocks.hash).toHaveBeenCalledTimes(2);
    });

    it.each([null, { ...user, emailVerified: new Date() }])("sends decoy mail for nonpending state %j", async (state) => {
        mocks.findUser.mockResolvedValue(state as User | null);
        await requestEmailVerification(user.email);
        expect(mocks.send).toHaveBeenCalledWith(user.email, expect.stringMatching(/^[a-f0-9]{64}$/));
        expect(tokens.size).toBe(0);
        expect(await consumeEmailVerification(mocks.send.mock.calls[0][1])).toBe(false);
    });

    it.each([null, user, { ...user, emailVerified: new Date() }])("fails delivery consistently and revokes failed tokens for %j", async (state) => {
        mocks.findUser.mockResolvedValue(state);
        mocks.send.mockRejectedValue(new Error("Delivery unavailable"));
        await expect(requestEmailVerification(user.email)).rejects.toThrow("Delivery unavailable");
        expect(tokens.size).toBe(0);
    });
});

describe("atomic verification", () => {
    it("verifies exactly once and invalidates sibling tokens", async () => {
        seedToken();
        seedToken("b".repeat(64));
        expect(await consumeEmailVerification(raw)).toBe(true);
        expect(mocks.updateUser).toHaveBeenCalledWith({
            where: { id: user.id, email: user.email, emailVerified: null },
            data: { emailVerified: expect.any(Date) },
        });
        expect(await consumeEmailVerification(raw)).toBe(false);
        expect(await consumeEmailVerification("b".repeat(64))).toBe(false);
        expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    });

    it("allows just one concurrent consumer of the same token", async () => {
        seedToken();
        const results = await Promise.all([consumeEmailVerification(raw), consumeEmailVerification(raw)]);
        expect(results.sort()).toEqual([false, true]);
        expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    });

    it("rejects expiry including the exact boundary", async () => {
        vi.useFakeTimers();
        seedToken(raw, new Date());
        expect(await consumeEmailVerification(raw)).toBe(false);
        expect(mocks.updateUser).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it.each(["", "a".repeat(63), "A".repeat(64), "z".repeat(64), "token?x=1"])("rejects malformed token %s before DB access", async (token) => {
        expect(await consumeEmailVerification(token)).toBe(false);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it.each(["password-reset:v1:[]", "email-verification:v1:invalid", "email-verification:v1:[]"])("rejects wrong purpose or identity %s", async (identifier) => {
        seedToken().identifier = identifier;
        expect(await consumeEmailVerification(raw)).toBe(false);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it("cannot verify deleted, recreated, or email-changed accounts", async () => {
        seedToken();
        mocks.updateUser.mockResolvedValue({ count: 0 });
        expect(await consumeEmailVerification(raw)).toBe(false);
    });

    it("does not allow bypassing the email rate key with a different email", async () => {
        seedToken();
        expect(await consumeEmailVerification(raw, "other@example.com")).toBe(false);
        expect(tokens.size).toBe(1);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it("binds legacy mixed-case email without rewriting the account", async () => {
        seedToken().identifier = 'email-verification:v1:["u1","Test@Example.com"]';
        expect(await consumeEmailVerification(raw, "test@example.com")).toBe(true);
        expect(mocks.updateUser).toHaveBeenCalledWith({
            where: { id: "u1", email: "Test@Example.com", emailVerified: null },
            data: { emailVerified: expect.any(Date) },
        });
    });

    it("rolls token consumption back when updating the user fails", async () => {
        seedToken();
        mocks.updateUser.mockRejectedValue(new Error("DB unavailable"));
        await expect(consumeEmailVerification(raw)).rejects.toThrow("DB unavailable");
        expect(tokens.size).toBe(1);
    });
});
