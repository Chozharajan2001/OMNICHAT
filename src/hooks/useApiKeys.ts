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

    // Re-checks the credential already in the vault. The key itself never goes
    // back and forth over this call: only the verdict comes home.
    const validateKey = async (providerId: string): Promise<boolean> => {
        const res = await fetch(`/api/api-keys/${providerId}/validate`, { method: "POST" });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to validate API key");
        }
        const data = await res.json();
        await fetchKeys();
        return Boolean(data.valid);
    };

    return { keys, loading, error, addKey, removeKey, validateKey, refresh: fetchKeys };
}
