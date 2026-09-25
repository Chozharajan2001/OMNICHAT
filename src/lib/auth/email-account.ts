import { prisma } from "@/lib/db/prisma";

export function normalizeAccountEmail(email: string): string {
    return email.trim().toLowerCase();
}

export async function findEmailAccount(email: string) {
    const exact = await prisma.user.findUnique({ where: { email } });
    if (exact) return exact;
    // Legacy credentials accepted mixed-case addresses. Resolve them without
    // migrating accounts; parameterized SQL works on both SQLite and PostgreSQL.
    const matches = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM users WHERE lower(trim(email)) = ${email} LIMIT 2
    `;
    if (matches.length > 1) throw new Error("Ambiguous account identity");
    if (!matches.length) return null;
    return prisma.user.findUnique({ where: { id: matches[0].id } });
}
