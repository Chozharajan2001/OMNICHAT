import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getEmailConfiguration } from "@/lib/email/config";
import { sendVerificationEmail } from "@/lib/email/smtp";
import { normalizedEmailSchema, verificationSchema } from "./email-policy";
import { findEmailAccount, normalizeAccountEmail } from "./email-account";

const PURPOSE = "email-verification:v1:";
const TOKEN_LIFETIME_MS = 30 * 60_000;
const identitySchema = z.tuple([z.string().min(1), z.string().refine((email) => normalizedEmailSchema.safeParse(email).success)]);
class InvalidClaim extends Error {}

export function hashVerificationToken(token: string): string {
    return createHash("sha256").update(PURPOSE).update(token).digest("hex");
}

function identifierFor(user: { id: string; email: string }): string {
    return PURPOSE + JSON.stringify([user.id, user.email]);
}

function parseIdentifier(identifier: string): [string, string] | null {
    if (!identifier.startsWith(PURPOSE)) return null;
    try { return identitySchema.parse(JSON.parse(identifier.slice(PURPOSE.length))); }
    catch { return null; }
}

async function findOrRegister(email: string, password?: string) {
    // Equal password hashing work for existing and new registrations.
    const passwordHash = password === undefined ? undefined : await bcrypt.hash(password, 12);
    const user = await findEmailAccount(email);
    if (user || passwordHash === undefined) return user;
    // An empty update preserves the original password during duplicate/racing signup.
    return prisma.user.upsert({
        where: { email },
        create: { email, passwordHash, name: email.split("@")[0], emailVerified: null },
        update: {},
    });
}

export async function requestEmailVerification(email: string, password?: string): Promise<void> {
    getEmailConfiguration(); // Validate everything before hashing or database side effects.
    email = normalizedEmailSchema.parse(email);
    const user = await findOrRegister(email, password);
    const rawToken = randomBytes(32).toString("hex");
    const token = hashVerificationToken(rawToken);
    const eligible = user && !user.emailVerified;
    if (eligible) {
        const identifier = identifierFor(user);
        await prisma.verificationToken.deleteMany({ where: { identifier, expires: { lte: new Date() } } });
        await prisma.verificationToken.create({
            data: { identifier, token, expires: new Date(Date.now() + TOKEN_LIFETIME_MS) },
        });
    }
    try {
        // All states receive the same message. Nonpending accounts get an unstored
        // decoy token, so even SMTP rejection cannot disclose account existence.
        await sendVerificationEmail(email, rawToken);
    } catch (error) {
        if (eligible) await prisma.verificationToken.deleteMany({ where: { token } });
        throw error;
    }
}

async function claimToken(tx: Prisma.TransactionClient, token: string, expectedEmail?: string): Promise<boolean> {
    const record = await tx.verificationToken.findUnique({ where: { token } });
    if (!record) return false;
    const identity = parseIdentifier(record.identifier);
    if (!identity) return false;
    if (expectedEmail !== undefined && normalizeAccountEmail(identity[1]) !== expectedEmail) return false;
    const now = new Date();
    // The conditional deletion is the atomic claim. User update and sibling
    // invalidation commit together; any failed update rolls the claim back.
    const claimed = await tx.verificationToken.deleteMany({
        where: { token, identifier: record.identifier, expires: { gt: now } },
    });
    if (claimed.count !== 1) return false;
    const [id, email] = identity;
    const updated = await tx.user.updateMany({
        where: { id, email, emailVerified: null }, data: { emailVerified: now },
    });
    if (updated.count !== 1) throw new InvalidClaim();
    await tx.verificationToken.deleteMany({ where: { identifier: record.identifier } });
    return true;
}

export async function consumeEmailVerification(rawToken: string, expectedEmail?: string): Promise<boolean> {
    if (!verificationSchema.safeParse({ token: rawToken }).success) return false;
    const token = hashVerificationToken(rawToken);
    try {
        return await prisma.$transaction((tx) => claimToken(tx, token, expectedEmail));
    } catch (error) {
        if (error instanceof InvalidClaim) return false;
        throw error;
    }
}
