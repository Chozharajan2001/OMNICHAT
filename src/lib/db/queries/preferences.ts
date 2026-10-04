import { prisma } from "@/lib/db/prisma";
import { DEFAULT_USER_PREFERENCES } from "@/lib/constants";
import type { UserPreference } from "@prisma/client";

/**
 * Get the preferences for a given user.
 * Returns `null` if no preferences row exists yet.
 */
export async function getPreferences(
    userId: string
): Promise<UserPreference | null> {
    return await prisma.userPreference.findUnique({
        where: { userId },
    });
}

/**
 * Create or update a user's preferences.
 *
 * You can pass any subset of fields; the others will be left as‑is on update.
 * If no preferences exist yet, a new row is created.
 */
export async function upsertPreferences(
    userId: string,
    data: Partial<Pick<UserPreference, "defaultProviderId" | "defaultModelId" | "defaultSystemPrompt" | "theme" | "sendWithEnter" | "showTokenCount">>
): Promise<UserPreference> {
    return await prisma.userPreference.upsert({
        where: { userId },
        create: {
            userId,
            ...data,
            // Shared with the client so an account that has never saved renders
            // exactly what the first save will store.
            defaultProviderId: data.defaultProviderId ?? DEFAULT_USER_PREFERENCES.defaultProviderId,
            defaultModelId: data.defaultModelId ?? DEFAULT_USER_PREFERENCES.defaultModelId,
            defaultSystemPrompt: data.defaultSystemPrompt ?? DEFAULT_USER_PREFERENCES.defaultSystemPrompt,
            theme: data.theme ?? DEFAULT_USER_PREFERENCES.theme,
            sendWithEnter: data.sendWithEnter ?? DEFAULT_USER_PREFERENCES.sendWithEnter,
            showTokenCount: data.showTokenCount ?? DEFAULT_USER_PREFERENCES.showTokenCount,
        },
        update: data,
    });
}

/**
 * Update only the theme preference (convenience for dark/light mode toggle).
 */
export async function setTheme(userId: string, theme: "light" | "dark" | "system") {
    return await prisma.userPreference.upsert({
        where: { userId },
        create: {
            userId,
            theme,
        },
        update: { theme },
    });
}
