"use client";

import { useState, useEffect, useCallback } from "react";
import type { UserPreference } from "@/types";

export function usePreferences() {
    const [preferences, setPreferences] = useState<UserPreference | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPreferences = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/preferences");
            if (!res.ok) {
                throw new Error("Failed to fetch preferences");
            }
            const data = await res.json();
            setPreferences(data.preferences);
            setError(null);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Failed to fetch preferences";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPreferences();
    }, [fetchPreferences]);

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
        const data = await res.json();
        setPreferences(data.preferences);
        return data.preferences;
    };

    return {
        preferences,
        loading,
        error,
        updatePreferences,
        refresh: fetchPreferences,
    };
}
