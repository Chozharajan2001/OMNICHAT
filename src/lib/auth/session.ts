import { auth } from "./config";
import { hasVerifiedAccess } from "./verified-access";

export async function getServerSession() {
    try {
        const session = await auth();
        if (!session?.user?.id) return null;
        if (!await hasVerifiedAccess(session.user.id, session.user.email)) return null;
        return session;
    } catch {
        return null;
    }
}

export async function requireAuth() {
    const session = await getServerSession();
    if (!session?.user?.id) throw new Error("Unauthorized");
    return session;
}
