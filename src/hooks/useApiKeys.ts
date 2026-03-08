"use client";

import { useState, useEffect, useCallback } from "react";

interface ApiKey {
    id: string;
    providerId: string;
    keyHint: string;
    isValid: boolean;
    lastValidatedAt?: Date | null;
    createdAt: Date;
}

export function useApiKeys() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchKeys = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/api-keys");
            if (!res.ok) throw new Error("Failed to fetch API keys");
            const data = await res.json();
            setKeys(data.keys);
            setError(null);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : "Failed to fetch API keys";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchKeys();
    }, [fetchKeys]);

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
