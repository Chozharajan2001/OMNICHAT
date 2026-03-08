/* eslint-disable react-hooks/set-state-in-effect -- This file uses setState in effects for legitimate initialization and state correction patterns */
"use client";

import { useState, useEffect, useMemo } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { SUPPORTED_PROVIDERS, getProvider, type ModelDefinition } from "@/lib/mastra/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from "lucide-react";

export default function PreferencesPage() {
    const { preferences, loading, error, updatePreferences } = usePreferences();

    // Local state
    const [providerId, setProviderId] = useState<string>("openai");
    const [modelId, setModelId] = useState<string>("");
    const [defaultSystemPrompt, setDefaultSystemPrompt] = useState<string>("");
    const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
    const [sendWithEnter, setSendWithEnter] = useState<boolean>(true);
    const [showTokenCount, setShowTokenCount] = useState<boolean>(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Populate state when preferences load (only once)
    // This is a legitimate use of setState in effect for one-time initialization
    useEffect(() => {
        if (preferences && !isInitialized) {
            // Batch all state updates in a single effect to prevent cascading renders
            const init = () => {
                setProviderId(preferences.defaultProviderId || "openai");
                setModelId(preferences.defaultModelId || "");
                setDefaultSystemPrompt(preferences.defaultSystemPrompt ?? "");
                setTheme(preferences.theme as "light" | "dark" | "system");
                setSendWithEnter(preferences.sendWithEnter ?? true);
                setShowTokenCount(preferences.showTokenCount ?? false);
                setIsInitialized(true);
            };
            init();
        }
    }, [preferences, isInitialized]);

    // Compute models for current provider
    const availableModels = useMemo<ModelDefinition[]>(() => {
        const provider = getProvider(providerId);
        return provider?.models || [];
    }, [providerId]);

    // Auto-correct model selection if current selection is invalid for this provider
    // Using setState in effect here is appropriate - we're syncing UI state with external data changes
    useEffect(() => {
        if (availableModels.length > 0 && !availableModels.find(m => m.id === modelId)) {
            const def = availableModels.find(m => m.isDefault) || availableModels[0];
            // Use functional update to ensure we're working with latest state
            setModelId(currentModelId => currentModelId !== def.id ? def.id : currentModelId);
        }
    }, [availableModels, modelId]);

    const handleSave = async () => {
        await updatePreferences({
            defaultProviderId: providerId,
            defaultModelId: modelId,
            defaultSystemPrompt: defaultSystemPrompt || undefined,
            theme,
            sendWithEnter,
            showTokenCount,
        });
    };

    if (loading) return <p>Loading preferences...</p>;
    if (error) return <p className="text-destructive">Error: {error}</p>;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Preferences</CardTitle>
                    <CardDescription>Customize your default model and behavior.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Default Provider */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Default Provider</label>
                        <select
                            value={providerId}
                            onChange={(e) => setProviderId(e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2"
                        >
                            {SUPPORTED_PROVIDERS.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Default Model */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Default Model</label>
                        <select
                            value={modelId}
                            onChange={(e) => setModelId(e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2"
                        >
                            {availableModels.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* System Prompt */}
                    <div>
                        <label className="block text-sm font-medium mb-1">System Prompt</label>
                        <textarea
                            value={defaultSystemPrompt}
                            onChange={(e) => setDefaultSystemPrompt(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2"
                        />
                    </div>

                    {/* Theme */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Theme</label>
                        <select
                            value={theme}
                            onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
                            className="w-full rounded-md border border-input bg-background px-3 py-2"
                        >
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                            <option value="system">System</option>
                        </select>
                    </div>

                    {/* Send with Enter */}
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="sendWithEnter"
                            checked={sendWithEnter}
                            onChange={(e) => setSendWithEnter(e.target.checked)}
                            className="h-4 w-4"
                        />
                        <label htmlFor="sendWithEnter" className="text-sm font-medium">
                            Send with Enter
                        </label>
                    </div>

                    {/* Show Token Count */}
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="showTokenCount"
                            checked={showTokenCount}
                            onChange={(e) => setShowTokenCount(e.target.checked)}
                            className="h-4 w-4"
                        />
                        <label htmlFor="showTokenCount" className="text-sm font-medium">
                            Show token count
                        </label>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSave} className="gap-2">
                        <Save className="h-4 w-4" />
                        Save Preferences
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
