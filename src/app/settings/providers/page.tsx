"use client";

import { useState } from "react";
import { useApiKeys } from "@/hooks/useApiKeys";
import { SUPPORTED_PROVIDERS, type ProviderDefinition } from "@/lib/mastra/providers";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Key, Trash2, ExternalLink, CheckCircle2, ShieldAlert, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/stores/toast-store";

// Module scope so the dialog copy does not add branches to the page component's
// own complexity budget.
function keyDeleteCopy(provider: ProviderDefinition | null): string {
    return `Remove the stored key for ${provider?.name ?? "this provider"}? Chats routed to it will fail until you save a new one.`;
}

type KeyState = "none" | "unverified" | "connected";

// A credential saved without provider confirmation exists in the vault but used
// to render as "not connected": the hint and Remove button were hidden, so the
// only way forward was to retype a key that was already stored.
function keyState(userKey: { isValid: boolean } | undefined): KeyState {
    if (!userKey) return "none";
    return userKey.isValid ? "connected" : "unverified";
}

interface CardProps {
    provider: ProviderDefinition;
    state: KeyState;
    keyHint: string | undefined;
    input: string;
    isSaving: boolean;
    isVerifying: boolean;
    error: string | null;
    onInputChange: (providerId: string, value: string) => void;
    onSave: (provider: ProviderDefinition) => void;
    onVerify: (provider: ProviderDefinition) => void;
    onRemove: (provider: ProviderDefinition) => void;
}

function ConnectionBadge({ state }: { state: KeyState }) {
    if (state === "connected") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/12 px-2 py-1 text-xs font-medium text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                Connected
            </span>
        );
    }
    if (state === "unverified") {
        // The `accent` surface rather than a raw amber: the design-token guard
        // forbids palette utilities, and this state is attention, not failure.
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent-foreground/25 bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
                <ShieldAlert className="h-3.5 w-3.5" />
                Stored, not verified
            </span>
        );
    }
    return null;
}

function StoredKeyPanel({ provider, keyHint, state, isVerifying, onVerify, onRemove }: CardProps) {
    return (
        <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-border/70 bg-background/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Key className="h-4 w-4 text-primary" />
                    Stored credential
                </div>
                <div className="font-mono text-sm text-muted-foreground">
                    {keyHint}
                </div>
                {state === "unverified" ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Saved encrypted but never confirmed with the provider, so chats routed to it
                        may fail. Verifying sends one real request, which uses a little of your quota.
                    </p>
                ) : null}
            </div>
            {state === "unverified" ? (
                <Button
                    variant="secondary"
                    onClick={() => onVerify(provider)}
                    disabled={isVerifying}
                    className="rounded-full"
                >
                    <ShieldAlert className="h-4 w-4" />
                    {isVerifying ? "Verifying..." : "Verify with provider"}
                </Button>
            ) : null}
            <Button
                variant="destructive"
                onClick={() => onRemove(provider)}
                className="rounded-full"
            >
                <Trash2 className="h-4 w-4" />
                Remove key
            </Button>
        </div>
    );
}

function AddKeyPanel({ provider, input, isSaving, error, onInputChange, onSave }: CardProps) {
    return (
        <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-border/70 bg-background/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Secure key vault
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                    Your key is encrypted before it reaches the database.
                </p>
                <div className="flex gap-3">
                    <Input
                        type="password"
                        placeholder={provider.keyPlaceholder}
                        value={input}
                        onChange={(e) => onInputChange(provider.id, e.target.value)}
                        className="h-12 rounded-2xl border-border/70 bg-background/60"
                        disabled={isSaving}
                    />
                    <Button
                        onClick={() => onSave(provider)}
                        disabled={!input.trim() || isSaving}
                        className="rounded-full px-5"
                    >
                        {isSaving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            {error ? (
                <p className="text-sm text-destructive">{error}</p>
            ) : null}

            <p className="text-xs leading-5 text-muted-foreground">
                Need a key? Visit{" "}
                <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-foreground"
                >
                    provider documentation
                </a>
                .
            </p>
        </div>
    );
}

function ProviderCard(props: CardProps) {
    const { provider, state } = props;

    return (
        <section
            className={cn(
                "rounded-[1.75rem] border p-6",
                state === "none"
                    ? "border-border/70 bg-background/30"
                    : "border-primary/25 bg-primary/8"
            )}
        >
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-xl font-semibold">{provider.name}</h3>
                        <ConnectionBadge state={state} />
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                        {provider.description}
                    </p>
                </div>

                <a
                    href={provider.website}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full border border-border/70 bg-background/30"
                    >
                        <ExternalLink className="h-4 w-4" />
                        Site
                    </Button>
                </a>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
                {provider.models.slice(0, 3).map((model) => (
                    <span
                        key={model.id}
                        className="rounded-full border border-border/70 bg-background/30 px-3 py-1 text-xs text-muted-foreground"
                    >
                        {model.name}
                    </span>
                ))}
            </div>

            {state === "none" ? <AddKeyPanel {...props} /> : <StoredKeyPanel {...props} />}
        </section>
    );
}

export default function ProvidersPage() {
    const { keys, loading, error, addKey, removeKey, validateKey } = useApiKeys();
    const { success, error: toastError } = useToast();

    const keyMap = new Map<string, (typeof keys)[0]>();
    keys.forEach((key) => keyMap.set(key.providerId, key));

    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [verifying, setVerifying] = useState<Record<string, boolean>>({});
    const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});

    const handleInputChange = (providerId: string, value: string) => {
        setInputValues((prev) => ({ ...prev, [providerId]: value }));
        setErrorMap((prev) => ({ ...prev, [providerId]: null }));
    };

    const handleSaveKey = async (provider: ProviderDefinition) => {
        const key = inputValues[provider.id] ?? "";
        if (!key.trim()) return;

        setSaving((prev) => ({ ...prev, [provider.id]: true }));
        setErrorMap((prev) => ({ ...prev, [provider.id]: null }));

        try {
            await addKey(provider.id, key);
            setInputValues((prev) => ({ ...prev, [provider.id]: "" }));
            success("API key saved", provider.name);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Failed to save API key";
            setErrorMap((prev) => ({ ...prev, [provider.id]: errorMessage }));
            toastError("Save failed", errorMessage);
        } finally {
            setSaving((prev) => ({ ...prev, [provider.id]: false }));
        }
    };

    const handleVerifyKey = async (provider: ProviderDefinition) => {
        setVerifying((prev) => ({ ...prev, [provider.id]: true }));

        try {
            const valid = await validateKey(provider.id);
            // Both outcomes are reported: a refused key is information the user
            // has no other way to get, since the credential never leaves the vault.
            if (valid) {
                success("Key verified", provider.name);
            } else {
                toastError("Key rejected", `${provider.name} refused the stored key.`);
            }
        } catch (err: unknown) {
            console.error(err);
            toastError("Verification failed", err instanceof Error ? err.message : undefined);
        } finally {
            setVerifying((prev) => ({ ...prev, [provider.id]: false }));
        }
    };

    const [deleteTarget, setDeleteTarget] = useState<ProviderDefinition | null>(null);

    const removeTargetKey = async () => {
        if (!deleteTarget) return;
        try {
            await removeKey(deleteTarget.id);
            success("API key removed");
        } catch (err: unknown) {
            console.error(err);
            toastError("Delete failed");
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="section-kicker mb-3">Models and keys</div>
                    <h2 className="text-4xl font-semibold tracking-tight">Provider connections</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        Bring your own keys, keep them encrypted at rest, and decide exactly which
                        providers should be available in your workspace.
                    </p>
                </div>
                <div className="rounded-full border border-border/70 bg-background/30 px-4 py-2 text-sm text-muted-foreground">
                    {keys.length} provider{keys.length === 1 ? "" : "s"} connected
                </div>
            </div>

            {loading ? (
                <div role="status" aria-live="polite" className="space-y-3">
                    <p className="sr-only">Loading provider connections</p>
                    {[0, 1, 2].map((row) => (
                        <div key={row} className="flex items-center gap-4 rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                            <Skeleton className="h-10 w-10 rounded-2xl" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-56" />
                            </div>
                            <Skeleton className="h-9 w-24 rounded-full" />
                        </div>
                    ))}
                </div>
            ) : null}

            {error ? (
                <div role="alert" className="flex items-start gap-3 rounded-[1.75rem] border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </div>
            ) : null}

            {!loading && keys.length === 0 ? (
                <section className="rounded-[1.75rem] border border-primary/25 bg-primary/8 p-6">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                        <Sparkles className="h-4 w-4 text-primary" />
                        First-run setup
                    </div>
                    <h3 className="text-2xl font-semibold tracking-tight">Connect one provider to unlock chat</h3>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                        OmniChat uses your own API keys. Add at least one provider below, then return
                        to the workspace and start chatting with your preferred model.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border/70 bg-background/30 px-3 py-2">
                            1. Paste your API key
                        </span>
                        <span className="rounded-full border border-border/70 bg-background/30 px-3 py-2">
                            2. Save encrypted credential
                        </span>
                        <span className="rounded-full border border-border/70 bg-background/30 px-3 py-2">
                            3. Start a new conversation
                        </span>
                    </div>
                </section>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-2">
                {SUPPORTED_PROVIDERS.map((provider) => (
                    <ProviderCard
                        key={provider.id}
                        provider={provider}
                        state={keyState(keyMap.get(provider.id))}
                        keyHint={keyMap.get(provider.id)?.keyHint}
                        input={inputValues[provider.id] || ""}
                        isSaving={!!saving[provider.id]}
                        isVerifying={!!verifying[provider.id]}
                        error={errorMap[provider.id] ?? null}
                        onInputChange={handleInputChange}
                        onSave={handleSaveKey}
                        onVerify={handleVerifyKey}
                        onRemove={setDeleteTarget}
                    />
                ))}
            </div>

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete API key"
                description={keyDeleteCopy(deleteTarget)}
                onConfirm={removeTargetKey}
                onClose={() => setDeleteTarget(null)}
            />
        </div>
    );
}
