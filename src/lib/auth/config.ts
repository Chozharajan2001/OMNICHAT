// src/lib/auth/config.ts
// ────────────────────────────────────────────────────────────────
// NextAuth v5 configuration with password and OAuth support.
// Password auth is default for desktop; OAuth is optional.
// ────────────────────────────────────────────────────────────────

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    adapter: PrismaAdapter(prisma),
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/login",
        error: "/login",
    },
    providers: [
        // Password authentication (primary for desktop)
        Credentials({
            name: "Password",
            credentials: {
                email: {
                    label: "Email",
                    type: "email",
                    placeholder: "you@example.com",
                },
                password: {
                    label: "Password",
                    type: "password",
                },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const email = credentials.email as string;
                const password = credentials.password as string;

                const user = await prisma.user.findUnique({
                    where: { email },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        passwordHash: true,
                    },
                });

                // If no user exists, create one (first-time setup for desktop)
                if (!user) {
                    // Only allow auto-creation in development or desktop mode
                    const isDesktopMode = process.env.DESKTOP_MODE === "true";
                    const isDev = process.env.NODE_ENV === "development";

                    if (!isDesktopMode && !isDev) {
                        return null;
                    }

                    // Create user with hashed password
                    const hashedPassword = await bcrypt.hash(password, 10);
                    const newUser = await prisma.user.create({
                        data: {
                            email,
                            passwordHash: hashedPassword,
                            name: email.split("@")[0],
                        },
                    });

                    return {
                        id: newUser.id,
                        email: newUser.email,
                        name: newUser.name,
                    };
                }

                // Verify password
                if (!user.passwordHash) {
                    // User exists but has no password (OAuth user)
                    return null;
                }

                const isValid = await bcrypt.compare(password, user.passwordHash);
                if (!isValid) {
                    return null;
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                };
            },
        }),

        // OAuth providers (optional, for server deployments)
        ...(process.env.GOOGLE_CLIENT_ID
            ? [
                  Google({
                        clientId: process.env.GOOGLE_CLIENT_ID,
                        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                    }),
              ]
            : []),

        ...(process.env.GITHUB_CLIENT_ID
            ? [
                  GitHub({
                        clientId: process.env.GITHUB_CLIENT_ID,
                        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
                    }),
              ]
            : []),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user && token.id) {
                session.user.id = token.id as string;
            }
            return session;
        },
    },
});
