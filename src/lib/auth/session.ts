// src/lib/auth/session.ts
import { auth } from "./config";

/**
 * Get the current session on the server.
 *
 * Useful in Server Components, API Routes, and Server Actions.
 *
 * @returns The session object if available, otherwise null.
 */
export async function getServerSession() {
    return await auth();
}

/**
 * Get the current session, throwing if not authenticated.
 *
 * Use this for protected server components or API routes where
 * you want to immediately bail out if the user is not logged in.
 *
 * @throws {Error} If there is no valid session.
 * @returns The authenticated session.
 */
export async function requireAuth() {
    const session = await auth();
    if (!session || !session.user?.id) {
        throw new Error("Unauthorized");
    }
    return session;
}
