import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { authRateLimiter, createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { getEmailConfiguration } from "@/lib/email/config";
import { canAutoCreateAccount, isEmailVerificationRequired, normalizedEmailSchema, validatePasswordComplexity } from "./email-policy";
import { hasVerifiedAccess } from "./verified-access";
import { findEmailAccount, normalizeAccountEmail } from "./email-account";

const emailLoginLimiter = createRateLimiter({
    windowMs: 15 * 60_000,
    maxRequests: 5,
    keyGenerator: (email) => `auth:email:${createHash("sha256").update(email).digest("hex")}`,
});

async function createLocalAccount(email: string, password: string) {
    if (!canAutoCreateAccount() || !validatePasswordComplexity(password)) return null;
    return prisma.user.create({
        data: { email, passwordHash: await bcrypt.hash(password, 10), name: email.split("@")[0] },
        select: { id: true, email: true, name: true },
    });
}

async function authenticatePassword(email: string, password: string) {
    const user = await findEmailAccount(email);
    if (!user) return createLocalAccount(email, password);
    if (!user.passwordHash) return null;
    if (!await bcrypt.compare(password, user.passwordHash)) return null;
    if (isEmailVerificationRequired() && !user.emailVerified) return null;
    return { id: user.id, email: user.email, name: user.name };
}

export async function authorizePassword(credentials: Partial<Record<"email" | "password", unknown>>, request: Request) {
    try {
        const parsed = normalizedEmailSchema.safeParse(credentials.email);
        const password = credentials.password;
        if (!parsed.success || typeof password !== "string" || !password || password.length > 1024) return null;
        if (isEmailVerificationRequired()) getEmailConfiguration();
        const results = await Promise.all([
            authRateLimiter.check(getClientIp(request)), emailLoginLimiter.check(parsed.data),
        ]);
        if (results.some((result) => result.limited)) return null;
        return await authenticatePassword(parsed.data, password);
    } catch (error) {
        // Including async rate-limiter outages: fail closed, never log credentials.
        // Logged because Auth.js only shows the user "CredentialsSignin", which
        // otherwise hides a misconfigured RATE_LIMIT_BACKEND or a missing table.
        console.error("Sign-in refused by a fail-closed dependency:", error);
        return null;
    }
}

const adapter = PrismaAdapter(prisma);

// Auth.js refuses any Host header it was never told to trust, and the failure is
// opaque to users: every production sign-in lands on /login?error=Configuration.
// Trust is granted when the operator pinned a canonical origin (the same value
// the CSRF guard resolves) or asked for it explicitly.
export function shouldTrustHost(
    env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
    if (env.AUTH_TRUST_HOST?.toUpperCase() === "TRUE") return true;
    return Boolean(env.APP_ORIGIN || env.AUTH_URL || env.NEXTAUTH_URL);
}

export const authConfig = {
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    trustHost: shouldTrustHost(),
    adapter: {
        ...adapter,
        getUserByEmail: (email) => findEmailAccount(normalizeAccountEmail(email)),
        async createUser(data) {
            // Provider claims are not proof of completing our verification flow.
            return adapter.createUser!({ ...data, email: normalizedEmailSchema.parse(data.email), emailVerified: null });
        },
        async updateUser(data) {
            const { emailVerified: providerClaim, ...safeData } = data;
            void providerClaim;
            if (!safeData.email) return adapter.updateUser!(safeData);
            const email = normalizedEmailSchema.parse(safeData.email);
            const current = await prisma.user.findUnique({ where: { id: safeData.id } });
            // Do not rewrite the verified timestamp from a stale read or provider claim.
            if (current?.email === email) return adapter.updateUser!({ ...safeData, email });
            return adapter.updateUser!({ ...safeData, email, emailVerified: null });
        },
    },
    session: { strategy: "jwt" },
    pages: { signIn: "/login", error: "/login" },
    providers: [
        Credentials({
            name: "Password",
            credentials: {
                email: { label: "Email", type: "email", placeholder: "you@example.com" },
                password: { label: "Password", type: "password" },
            },
            authorize: authorizePassword,
        }),
        ...(process.env.GOOGLE_CLIENT_ID ? [Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        })] : []),
        ...(process.env.GITHUB_CLIENT_ID ? [GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        })] : []),
    ],
    callbacks: {
        async signIn({ user }) {
            if (!isEmailVerificationRequired()) return true;
            try {
                getEmailConfiguration();
                return normalizedEmailSchema.safeParse(user.email).success;
            } catch {
                return false;
            }
        },
        async jwt({ token, user }) {
            if (user) token.id = user.id;
            const id = token.id ?? token.sub;
            // This DB check applies to old JWTs and OAuth logins, not just newly
            // issued credential sessions. Revocation takes effect on the next request.
            if (!await hasVerifiedAccess(id, token.email)) return null;
            token.id = id;
            return token;
        },
        async session({ session, token }) {
            if (session.user && typeof token.id === "string") session.user.id = token.id;
            return session;
        },
    },
} satisfies NextAuthConfig;

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
