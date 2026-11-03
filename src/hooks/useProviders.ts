// src/hooks/useProviders.ts
// ────────────────────────────────────────────────────────────────
// Server view of providers, merged over the static registry.
// ────────────────────────────────────────────────────────────────
// The model picker and the providers page both need the same answer: which
// providers have a confirmed credential. /api/api-keys carries vault rows for
// CRUD and the unvalidated state; /api/providers answers the display question
// directly (registry entry + hasKey). One hook owns that view so the two
// surfaces cannot disagree.

"use client";

import { useMemo } from "react";
import { useJsonResource } from "./useJsonResource";
import { SUPPORTED_PROVIDERS, type ProviderDefinition } from "@/lib/mastra/providers";

export interface ProviderWithKey extends ProviderDefinition {
    hasKey: boolean;
    keyHint: string | null;
}

interface ProvidersResponse {
    providers: { id: string; hasKey: boolean; keyHint: string | null }[];
}

// Falling back to the statics is the same screen the picker showed while
// loading (connect prompt), never a false unlock: every entry defaults to
// hasKey false, and only the server can grant it.
export function mergeProviders(server: ProvidersResponse["providers"] | undefined): ProviderWithKey[] {
    const byId = new Map((server ?? []).map((entry) => [entry.id, entry]));
    return SUPPORTED_PROVIDERS.map((provider) => {
        const status = byId.get(provider.id);
        return { ...provider, hasKey: status?.hasKey ?? false, keyHint: status?.keyHint ?? null };
    });
}

export function useProviders() {
    const { data, loading, error, refresh } = useJsonResource<ProvidersResponse>(
        "/api/providers",
        "Failed to fetch providers"
    );
    const providers = useMemo(() => mergeProviders(data?.providers), [data]);
    return { providers, loading, error, refresh };
}
