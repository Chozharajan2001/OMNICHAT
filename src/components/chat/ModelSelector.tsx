// src/components/chat/ModelSelector.tsx
// ────────────────────────────────────────────────────────────────
// Model selector dropdown for choosing AI provider and model.
// ────────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";
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

const VALUE_SEPARATOR = ":";

// The picker lists only providers with a confirmed credential. Keyless
// providers used to render as disabled rows with "(No key)" tags, which buried
// the usable models under entries no click could ever reach; connecting a new
// provider is the providers page's job, one click away.
export function visibleProviders(keys: { providerId: string; isValid: boolean }[]) {
    return SUPPORTED_PROVIDERS.filter((option) =>
        keys.some((key) => key.providerId === option.id && key.isValid)
    );
}

// Radix hands back the whole `${providerId}:${modelId}` string. Model ids are
// not forbidden from containing a colon, and `split(":")` would truncate at the
// second one, so the pair is cut at the FIRST separator only.
export function splitModelValue(value: string): [string, string] {
    const at = value.indexOf(VALUE_SEPARATOR);
    if (at < 0) return [value, ""];
    return [value.slice(0, at), value.slice(at + 1)];
}

function PlaceholderButton({ kind }: { kind: "loading" | "connect" }) {
    const classes = "h-12 rounded-full border-border/70 bg-background/40 px-4";
    if (kind === "loading") {
        return (
            <Button variant="outline" disabled className={classes}>
                <KeyRound className="h-4 w-4" />
                Loading models
            </Button>
        );
    }
    return (
        <Button asChild variant="outline" className={classes}>
            <Link href="/settings/providers">
                <KeyRound className="h-4 w-4" />
                Connect a provider
            </Link>
        </Button>
    );
}

function ModelPicker() {
    const { modelId, providerId, setModel } = useChatStore();
    const { keys } = useApiKeys();
    const provider = getProvider(providerId);
    const model = getModel(providerId, modelId);

    // A key stored but never confirmed counts as absent here: without a working
    // credential the provider's models cannot be used.
    const listedProviders = visibleProviders(keys);

    // A persisted selection can outlive its credential (key removed, or
    // defaults naming a provider never connected): the header would offer an
    // unusable model and every send would 400. Fall back once to the first
    // keyed provider's default model; the guard above makes this run only
    // while the current selection is keyless, so it cannot loop.
    useEffect(() => {
        if (keys.some((key) => key.providerId === providerId && key.isValid)) {
            return;
        }
        const fallback = SUPPORTED_PROVIDERS.find((option) =>
            keys.some((key) => key.providerId === option.id && key.isValid)
        );
        if (!fallback) {
            return;
        }
        const fallbackModel =
            fallback.models.find((model) => model.isDefault) ?? fallback.models[0];
        if (fallbackModel && (fallback.id !== providerId || fallbackModel.id !== modelId)) {
            setModel(fallback.id, fallbackModel.id);
        }
    }, [keys, providerId, modelId, setModel]);

    const handleValueChange = (value: string) => {
        const [nextProviderId, nextModelId] = splitModelValue(value);
        setModel(nextProviderId, nextModelId);
    };

    return (
        <Select
            value={`${providerId}:${modelId}`}
            onValueChange={handleValueChange}
        >
            {/* role=combobox does not take its name from contained text, so the
                visible model/provider labels announce nothing on their own. */}
            <SelectTrigger
                aria-label="Chat model"
                className="h-12 w-full max-w-[260px] min-w-0 rounded-full border-border/70 bg-background/40 px-4 shadow-none"
            >
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
                {listedProviders.map((option) => (
                    <SelectGroup key={option.id}>
                        <SelectLabel>
                            <span>{option.name}</span>
                        </SelectLabel>
                        {option.models.map((optionModel) => (
                            <SelectItem
                                key={`${option.id}:${optionModel.id}`}
                                value={`${option.id}:${optionModel.id}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span>{optionModel.name}</span>
                                    {optionModel.isDefault && (
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

export function ModelSelector() {
    // `loading` was ignored, so every mount answered "no keys" while the vault
    // request was still in flight and the Connect prompt flashed before the
    // real selector replaced it.
    const { keys, loading } = useApiKeys();
    if (loading) return <PlaceholderButton kind="loading" />;
    if (!keys.some((key) => key.isValid)) return <PlaceholderButton kind="connect" />;

    return <ModelPicker />;
}
