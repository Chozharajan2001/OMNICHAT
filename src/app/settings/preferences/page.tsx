"use client";

import { useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import {
    type AppLanguage,
    usePersonalizationStore,
    type ChatDensity,
    type SidebarDefaultState,
} from "@/stores/personalization-store";
import {
    SUPPORTED_PROVIDERS,
    getProvider,
    type ModelDefinition,
} from "@/lib/mastra/providers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Keyboard, Languages, LayoutPanelLeft, Paintbrush, Rows3, Save, Sparkles } from "lucide-react";

const LANGUAGE_OPTIONS: { value: AppLanguage; label: string; note: string }[] = [
    { value: "en-US", label: "English (US)", note: "Default product language" },
    { value: "en-GB", label: "English (UK)", note: "Alternative English locale" },
    { value: "ta-IN", label: "Tamil (India)", note: "Preference saved for future localization" },
];

export default function PreferencesPage() {
    const { preferences, loading, error, updatePreferences } = usePreferences();
    if (loading) {
        return <p className="text-sm text-muted-foreground">Loading preferences...</p>;
    }
    if (error || !preferences) {
        return <p className="text-sm text-destructive">Error: {error || "Preferences unavailable"}</p>;
    }
    return <PreferencesForm initialPreferences={preferences} updatePreferences={updatePreferences} />;
}

function PreferencesForm({ initialPreferences, updatePreferences }: {
    initialPreferences: NonNullable<ReturnType<typeof usePreferences>["preferences"]>;
    updatePreferences: ReturnType<typeof usePreferences>["updatePreferences"];
}) {
    const {
        language,
        chatDensity,
        sidebarDefaultState,
        welcomeMessage,
        setLanguage,
        setChatDensity,
        setSidebarDefaultState,
        setWelcomeMessage,
    } = usePersonalizationStore();

    // Mount only after loading; edits are not overwritten by later save responses.
    const [providerId, setProviderId] = useState(initialPreferences.defaultProviderId || "openai");
    const [selectedModelId, setModelId] = useState(initialPreferences.defaultModelId || "");
    const [defaultSystemPrompt, setDefaultSystemPrompt] = useState(initialPreferences.defaultSystemPrompt ?? "");
    const [theme, setTheme] = useState(initialPreferences.theme as "light" | "dark" | "system");
    const [sendWithEnter, setSendWithEnter] = useState(initialPreferences.sendWithEnter ?? true);
    const [showTokenCount, setShowTokenCount] = useState(initialPreferences.showTokenCount ?? false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [welcomeDraft, setLocalWelcomeMessage] = useState<string | null>(null);
    const localWelcomeMessage = welcomeDraft ?? welcomeMessage;

    const availableModels = useMemo<ModelDefinition[]>(() => {
        const provider = getProvider(providerId);
        return provider?.models || [];
    }, [providerId]);
    const modelId = availableModels.find((model) => model.id === selectedModelId)?.id
        ?? availableModels.find((model) => model.isDefault)?.id
        ?? availableModels[0]?.id
        ?? "";

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const applyTheme = () => {
            document.documentElement.dataset.theme = theme === "system"
                ? (mediaQuery.matches ? "dark" : "light")
                : theme;
        };
        applyTheme();
        window.localStorage.setItem("omnichat-theme", theme);
        mediaQuery.addEventListener("change", applyTheme);
        return () => mediaQuery.removeEventListener("change", applyTheme);
    }, [theme]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);

        try {
            await updatePreferences({
                defaultProviderId: providerId,
                defaultModelId: modelId,
                defaultSystemPrompt: defaultSystemPrompt || undefined,
                theme,
                sendWithEnter,
                showTokenCount,
            });
            setWelcomeMessage(localWelcomeMessage.trim() || "What do you want to build, compare, or figure out today?");
            setLocalWelcomeMessage((current) => current === localWelcomeMessage ? null : current);
            setSaveMessage("Preferences updated");
        } catch (cause) {
            setSaveMessage(cause instanceof Error ? cause.message : "Failed to save preferences");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="section-kicker mb-3">General</div>
                    <h2 className="text-4xl font-semibold tracking-tight">Personalize your desk</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        Choose the default model behavior, shape your writing style, and make the
                        workspace feel like your own every time you open it.
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded-full px-5 shadow-[0_16px_30px_rgba(124,109,255,0.22)]"
                >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save preferences"}
                </Button>
            </div>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                <div className="space-y-6">
                    <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Default model identity</h3>
                                <p className="text-sm text-muted-foreground">
                                    The default provider and model used for new conversations.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-medium">Provider</span>
                                <select
                                    value={providerId}
                                    onChange={(e) => setProviderId(e.target.value)}
                                    className="flex h-12 w-full rounded-2xl border border-input bg-background/60 px-4 text-sm"
                                >
                                    {SUPPORTED_PROVIDERS.map((provider) => (
                                        <option key={provider.id} value={provider.id}>
                                            {provider.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-medium">Model</span>
                                <select
                                    value={modelId}
                                    onChange={(e) => setModelId(e.target.value)}
                                    className="flex h-12 w-full rounded-2xl border border-input bg-background/60 px-4 text-sm"
                                >
                                    {availableModels.map((model) => (
                                        <option key={model.id} value={model.id}>
                                            {model.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>

                    <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                                <Paintbrush className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Theme and behavior</h3>
                                <p className="text-sm text-muted-foreground">
                                    Control how the workspace looks and how the composer behaves.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                                    <Languages className="h-4 w-4 text-primary" />
                                    Language
                                </div>
                                <div className="grid gap-2 rounded-[1.25rem] border border-border/70 bg-background/40 p-2">
                                    {LANGUAGE_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setLanguage(option.value)}
                                            className={`flex items-start justify-between rounded-[1rem] px-4 py-3 text-left ${
                                                language === option.value
                                                    ? "bg-primary text-primary-foreground"
                                                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                                            }`}
                                        >
                                            <div>
                                                <div className="font-medium">{option.label}</div>
                                                <div className={`text-xs ${language === option.value ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                                    {option.note}
                                                </div>
                                            </div>
                                            {language === option.value ? <Check className="mt-0.5 h-4 w-4" /> : null}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="mb-3 text-sm font-medium">Theme</div>
                                <div className="grid grid-cols-3 gap-2 rounded-[1.25rem] border border-border/70 bg-background/40 p-1">
                                    {(["system", "light", "dark"] as const).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setTheme(option)}
                                            className={`rounded-[1rem] px-3 py-3 text-sm font-medium capitalize ${
                                                theme === option
                                                    ? "bg-primary text-primary-foreground"
                                                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                                            }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSendWithEnter((value) => !value)}
                                    className="flex items-center justify-between rounded-[1.25rem] border border-border/70 bg-background/30 px-4 py-4 text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <Keyboard className="h-4 w-4 text-primary" />
                                        <div>
                                            <div className="font-medium">Send with Enter</div>
                                            <div className="text-sm text-muted-foreground">
                                                Press Shift+Enter for a new line.
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`h-6 w-11 rounded-full p-1 ${sendWithEnter ? "bg-primary" : "bg-muted"}`}>
                                        <div
                                            className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                                sendWithEnter ? "translate-x-5" : "translate-x-0"
                                            }`}
                                        />
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowTokenCount((value) => !value)}
                                    className="flex items-center justify-between rounded-[1.25rem] border border-border/70 bg-background/30 px-4 py-4 text-left"
                                >
                                    <div>
                                        <div className="font-medium">Show token count</div>
                                        <div className="text-sm text-muted-foreground">
                                            Surface token usage in message metadata.
                                        </div>
                                    </div>
                                    <div className={`h-6 w-11 rounded-full p-1 ${showTokenCount ? "bg-primary" : "bg-muted"}`}>
                                        <div
                                            className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                                showTokenCount ? "translate-x-5" : "translate-x-0"
                                            }`}
                                        />
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                                <Rows3 className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Workspace personalization</h3>
                                <p className="text-sm text-muted-foreground">
                                    Control how dense the conversation feels and how the workspace opens.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <div className="mb-3 text-sm font-medium">Chat density</div>
                                <div className="grid grid-cols-2 gap-2 rounded-[1.25rem] border border-border/70 bg-background/40 p-1">
                                    {(["comfortable", "compact"] as const).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setChatDensity(option as ChatDensity)}
                                            className={`rounded-[1rem] px-3 py-3 text-sm font-medium capitalize ${
                                                chatDensity === option
                                                    ? "bg-primary text-primary-foreground"
                                                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                                            }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                                    <LayoutPanelLeft className="h-4 w-4 text-primary" />
                                    Sidebar default
                                </div>
                                <div className="grid grid-cols-2 gap-2 rounded-[1.25rem] border border-border/70 bg-background/40 p-1">
                                    {(["expanded", "collapsed"] as const).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setSidebarDefaultState(option as SidebarDefaultState)}
                                            className={`rounded-[1rem] px-3 py-3 text-sm font-medium capitalize ${
                                                sidebarDefaultState === option
                                                    ? "bg-primary text-primary-foreground"
                                                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                                            }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                        <div className="mb-4 text-lg font-semibold">System prompt</div>
                        <p className="mb-4 text-sm leading-6 text-muted-foreground">
                            Set the base tone, role, or task framing you want OmniChat to use for
                            every new conversation.
                        </p>
                        <Textarea
                            value={defaultSystemPrompt}
                            onChange={(e) => setDefaultSystemPrompt(e.target.value)}
                            rows={10}
                            className="rounded-[1.5rem] border border-input bg-background/60 p-4"
                            placeholder="You are a pragmatic research and engineering assistant..."
                        />
                    </div>

                    <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                        <div className="mb-4 text-lg font-semibold">Welcome message</div>
                        <p className="mb-4 text-sm leading-6 text-muted-foreground">
                            Set the first line you want to see in the empty chat state.
                        </p>
                        <Textarea
                            value={localWelcomeMessage}
                            onChange={(e) => setLocalWelcomeMessage(e.target.value)}
                            rows={4}
                            className="rounded-[1.5rem] border border-input bg-background/60 p-4"
                            placeholder="What do you want to build, compare, or figure out today?"
                        />
                    </div>

                    <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                        <div className="mb-4 text-lg font-semibold">Current profile</div>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                                <span className="text-muted-foreground">Language</span>
                                <span className="font-medium">
                                    {LANGUAGE_OPTIONS.find((option) => option.value === language)?.label || language}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                                <span className="text-muted-foreground">Theme</span>
                                <span className="font-medium capitalize">{theme}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                                <span className="text-muted-foreground">Provider</span>
                                <span className="font-medium">
                                    {getProvider(providerId)?.name || providerId}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                                <span className="text-muted-foreground">Model</span>
                                <span className="font-medium">{modelId || "Not selected"}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                                <span className="text-muted-foreground">Chat density</span>
                                <span className="font-medium capitalize">{chatDensity}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3">
                                <span className="text-muted-foreground">Sidebar</span>
                                <span className="font-medium capitalize">{sidebarDefaultState}</span>
                            </div>
                        </div>

                        {saveMessage ? (
                            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
                                <Check className="h-4 w-4 text-primary" />
                                {saveMessage}
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>
        </div>
    );
}
