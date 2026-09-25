"use client";

import { useJsonResource } from "./useJsonResource";
import type { UserPreference } from "@/types";

export function usePreferences() {
    const { data, loading, error, refresh, setData } = useJsonResource<{ preferences: UserPreference }>(
        "/api/preferences", "Failed to fetch preferences"
    );

    const updatePreferences = async (
        updates: Partial<Omit<UserPreference, "id" | "userId">>
    ) => {
        const res = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to update preferences");
        }
        const result: { preferences: UserPreference } = await res.json();
        setData(result);
        return result.preferences;
    };

    return {
        preferences: data?.preferences ?? null,
        loading,
        error,
        updatePreferences,
        refresh,
    };
}
