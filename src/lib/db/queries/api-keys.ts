import { prisma } from "@/lib/db/prisma";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto/vault";

/**
 * Save or update an API key for a user.
 *
 * - Encrypts the plain key before storage.
 * - Stores a hint (last 4 chars) for UI display.
 * - Optionally marks the key as valid (default: true).
 */
export async function saveApiKey(
    userId: string,
    providerId: string,
    plainKey: string,
    isValid: boolean = true
) {
    const encrypted = encryptApiKey(plainKey);
    const hint = plainKey.slice(-4).padStart(4, "•"); // simpler hint

    await prisma.userApiKey.upsert({
        where: {
            userId_providerId: {
                userId,
                providerId,
            },
        },
        create: {
            userId,
            providerId,
            encryptedKey: encrypted,
            keyHint: `...${hint}`,
            isValid,
            lastValidatedAt: isValid ? new Date() : null,
        },
        update: {
            encryptedKey: encrypted,
            keyHint: `...${hint}`,
            isValid,
            lastValidatedAt: isValid ? new Date() : null,
        },
    });
}

/**
 * Retrieve and decrypt a user’s API key for a given provider.
 * Returns `null` if no key exists or decryption fails.
 */
export async function getDecryptedKey(
    userId: string,
    providerId: string
): Promise<string | null> {
    const record = await prisma.userApiKey.findUnique({
        where: { userId_providerId: { userId, providerId } },
    });
    if (!record) return null;

    try {
        return decryptApiKey(record.encryptedKey);
    } catch {
        // Decryption failed – mark the key as invalid and return null
        await prisma.userApiKey.update({
            where: { id: record.id },
            data: { isValid: false },
        });
        return null;
    }
}

/**
 * Get all API keys for a user (only metadata, never the full key).
 */
export async function getUserKeys(userId: string) {
    return await prisma.userApiKey.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            providerId: true,
            keyHint: true,
            isValid: true,
            lastValidatedAt: true,
            createdAt: true,
        },
    });
}

/**
 * Delete a user’s API key for a specific provider.
 */
export async function deleteApiKey(userId: string, providerId: string) {
    await prisma.userApiKey.delete({
        where: { userId_providerId: { userId, providerId } },
    });
}

/**
 * Mark a key as valid/invalid (used after validation checks).
 */
export async function markKeyValid(
    userId: string,
    providerId: string,
    isValid: boolean
) {
    await prisma.userApiKey.update({
        where: { userId_providerId: { userId, providerId } },
        data: {
            isValid,
            // A failed check -- including a timeout or an unreachable provider,
            // which validateApiKey cannot tell from a refusal -- must not erase
            // when this key was last confirmed. That timestamp is the history;
            // isValid is the current state.
            ...(isValid ? { lastValidatedAt: new Date() } : {}),
        },
    });
}
