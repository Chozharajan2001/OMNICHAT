// src/components/chat/ModelSelector.tsx
// ────────────────────────────────────────────────────────────────
// Model selector dropdown for choosing AI provider and model.
// ────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { useChatStore } from "@/stores/chat-store";
import { useApiKeys } from "@/hooks/useApiKeys";
import { SUPPORTED_PROVIDERS } from "@/lib/mastra/providers";
import { getProvider, getModel } from "@/lib/mastra/providers";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
} from "@/components/ui/select";
import { KeyRound, Sparkles } from "lucide-react";

export function ModelSelector() {
    const { modelId, providerId, setModel } = useChatStore();
    const { keys } = useApiKeys();
    const provider = getProvider(providerId);
    const model = getModel(providerId, modelId);
    const hasAnyValidKey = keys.some((key) => key.isValid);

    // Check which providers have keys configured
    const hasKey = (providerId: string) => {
        return keys.some((k) => k.providerId === providerId && k.isValid);
    };

    const handleValueChange = (value: string) => {
        // Value format: "providerId:modelId"
        const [newProviderId, newModelId] = value.split(":");
        setModel(newProviderId, newModelId);
    };

    if (!hasAnyValidKey) {
        return (
            <Link href="/settings/providers">
                <Button
                    variant="outline"
                    className="h-12 rounded-full border-border/70 bg-background/40 px-4"
                >
                    <KeyRound className="h-4 w-4" />
                    Connect a provider
                </Button>
            </Link>
        );
    }

    return (
        <Select
            value={`${providerId}:${modelId}`}
            onValueChange={handleValueChange}
        >
            <SelectTrigger className="h-12 w-full max-w-[260px] min-w-0 rounded-full border-border/70 bg-background/40 px-4 shadow-none">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/14 text-primary">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 text-left">
                        <div className="truncate text-sm font-semibold">
                            {model?.name || "Select model"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                            {provider?.name || "Provider"}
                        </div>
                    </div>
                </div>
            </SelectTrigger>
            <SelectContent>
                {SUPPORTED_PROVIDERS.map((provider) => (
                    <SelectGroup key={provider.id}>
                        <SelectLabel className="flex items-center gap-2">
                            <span>{provider.name}</span>
                            {!hasKey(provider.id) && (
                                <span className="text-xs text-muted-foreground">
                                    (No key)
                                </span>
                            )}
                        </SelectLabel>
                        {provider.models.map((model) => (
                            <SelectItem
                                key={`${provider.id}:${model.id}`}
                                value={`${provider.id}:${model.id}`}
                                disabled={!hasKey(provider.id)}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span>{model.name}</span>
                                    {model.isDefault && (
                                        <span className="text-xs text-muted-foreground">
                                            Default
                                        </span>
                                    )}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectGroup>
                ))}
            </SelectContent>
        </Select>
    );
}
