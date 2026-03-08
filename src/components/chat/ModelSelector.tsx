// src/components/chat/ModelSelector.tsx
// ────────────────────────────────────────────────────────────────
// Model selector dropdown for choosing AI provider and model.
// ────────────────────────────────────────────────────────────────

"use client";

import { useChatStore } from "@/stores/chat-store";
import { useApiKeys } from "@/hooks/useApiKeys";
import { SUPPORTED_PROVIDERS } from "@/lib/mastra/providers";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export function ModelSelector() {
    const { modelId, providerId, setModel } = useChatStore();
    const { keys } = useApiKeys();

    // Check which providers have keys configured
    const hasKey = (providerId: string) => {
        return keys.some((k) => k.providerId === providerId && k.isValid);
    };

    const handleValueChange = (value: string) => {
        // Value format: "providerId:modelId"
        const [newProviderId, newModelId] = value.split(":");
        setModel(newProviderId, newModelId);
    };

    return (
        <Select
            value={`${providerId}:${modelId}`}
            onValueChange={handleValueChange}
        >
            <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select model" />
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
