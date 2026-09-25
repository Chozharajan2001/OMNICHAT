import { prisma } from "@/lib/db/prisma";
import { getEmailConfiguration } from "@/lib/email/config";
import { isEmailVerificationRequired } from "./email-policy";

export async function hasVerifiedAccess(id: unknown, email?: string | null): Promise<boolean> {
    if (!isEmailVerificationRequired()) return true;
    if (typeof id !== "string" || !id) return false;
    try {
        getEmailConfiguration();
        const user = await prisma.user.findUnique({
            where: { id }, select: { email: true, emailVerified: true },
        });
        if (!user?.emailVerified) return false;
        return !email || user.email === email;
    } catch {
        // Configuration/database failure must not grant access or leak details.
        return false;
    }
}
