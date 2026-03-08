"use client";

import { useState } from "react";
import { useApiKeys } from "@/hooks/useApiKeys";
import { SUPPORTED_PROVIDERS, type ProviderDefinition } from "@/lib/mastra/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, Trash2, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export default function ProvidersPage() {
    const { keys, addKey, removeKey } = useApiKeys();

    // Map user keys by provider ID for quick lookup
    const keyMap = new Map<string, (typeof keys)[0]>();
    keys.forEach((k) => keyMap.set(k.providerId, k));

    // Local state: input values and UI states per provider
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});

    const handleInputChange = (providerId: string, value: string) => {
        setInputValues((prev) => ({ ...prev, [providerId]: value }));
        setErrorMap((prev) => ({ ...prev, [providerId]: null }));
    };

    const handleSaveKey = async (provider: ProviderDefinition) => {
        const key = inputValues[provider.id];
        if (!key.trim()) return;

        setSaving((prev) => ({ ...prev, [provider.id]: true }));
        setErrorMap((prev) => ({ ...prev, [provider.id]: null }));

        try {
            await addKey(provider.id, key);
            // Clear input after successful save
            setInputValues((prev) => ({ ...prev, [provider.id]: "" }));
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Failed to save API key";
            setErrorMap((prev) => ({ ...prev, [provider.id]: errorMessage }));
        } finally {
            setSaving((prev) => ({ ...prev, [provider.id]: false }));
        }
    };

    const handleDelete = async (providerId: string) => {
        if (!confirm("Delete this API key?")) return;
        try {
            await removeKey(providerId);
        } catch (err: unknown) {
            console.error(err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-muted-foreground">
                    Connect your API keys to enable AI providers. Keys are encrypted and stored securely.
                </p>
            </div>

            {SUPPORTED_PROVIDERS.map((provider) => {
                const userKey = keyMap.get(provider.id);
                const hasKey = !!userKey?.isValid;
                const input = inputValues[provider.id] || "";
                const isSaving = saving[provider.id];
                const error = errorMap[provider.id];

                return (
                    <Card key={provider.id} className={cn(!hasKey && "border-dashed")}>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="flex items-center gap-2">
                                        {provider.name}
                                        {hasKey ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <CheckCircle className="h-3 w-3" /> Connected
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                                <XCircle className="h-3 w-3" /> Not configured
                                            </span>
                                        )}
                                    </CardTitle>
                                    <CardDescription>{provider.description}</CardDescription>
                                </div>
                                <a
                                    href={provider.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-muted-foreground hover:underline"
                                >
                                    <Button variant="ghost" size="sm" className="gap-1">
                                        <ExternalLink className="h-4 w-4" />
                                        Website
                                    </Button>
                                </a>
                            </div>
                        </CardHeader>

                        <CardContent>
                            {hasKey ? (
                                <div className="flex items-center gap-4 rounded-md bg-accent p-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Key className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-mono text-muted-foreground">
                                            Key saved: {userKey?.keyHint}
                                        </span>
                                    </div>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDelete(provider.id)}
                                        className="ml-auto"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                type="password"
                                                placeholder={provider.keyPlaceholder}
                                                value={input}
                                                onChange={(e) => handleInputChange(provider.id, e.target.value)}
                                                className="pl-9"
                                                disabled={isSaving}
                                            />
                                        </div>
                                        <Button
                                            onClick={() => handleSaveKey(provider)}
                                            disabled={!input.trim() || isSaving}
                                        >
                                            {isSaving ? "Saving…" : "Save"}
                                        </Button>
                                    </div>
                                    {error && <p className="text-sm text-destructive">{error}</p>}
                                    <p className="text-xs text-muted-foreground">
                                        Get your API key from{" "}
                                        <a
                                            href={provider.docsUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline hover:text-foreground"
                                        >
                                            {provider.docsUrl}
                                        </a>
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
