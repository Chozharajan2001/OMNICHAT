import { prisma } from "@/lib/db/prisma";
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
            // Sensible defaults for the initial create (if not provided)
            defaultProviderId: data.defaultProviderId ?? "openai",
            defaultModelId: data.defaultModelId ?? "gpt-4o",
            defaultSystemPrompt: data.defaultSystemPrompt ?? "You are a helpful assistant.",
            theme: data.theme ?? "dark",
            sendWithEnter: data.sendWithEnter ?? true,
            showTokenCount: data.showTokenCount ?? false,
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
