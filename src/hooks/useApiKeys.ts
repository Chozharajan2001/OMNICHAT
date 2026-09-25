"use client";

import { useJsonResource } from "./useJsonResource";

interface ApiKey {
    id: string;
    providerId: string;
    keyHint: string;
    isValid: boolean;
    lastValidatedAt?: Date | null;
    createdAt: Date;
}

export function useApiKeys() {
    const { data, loading, error, refresh: fetchKeys } = useJsonResource<{ keys: ApiKey[] }>(
        "/api/api-keys", "Failed to fetch API keys"
    );
    const keys = data?.keys ?? [];

    const addKey = async (providerId: string, apiKey: string, validate: boolean = true) => {
        const res = await fetch("/api/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId, apiKey, validate }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to save API key");
        }
        await fetchKeys();
    };

    const removeKey = async (providerId: string) => {
        const res = await fetch(`/api/api-keys/${providerId}`, { method: "DELETE" });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to delete API key");
        }
        await fetchKeys();
    };

    return { keys, loading, error, addKey, removeKey, refresh: fetchKeys };
}
