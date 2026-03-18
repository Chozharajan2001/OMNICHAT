"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Archive, EyeOff, MessageSquareDashed, RotateCcw, Trash2 } from "lucide-react";
import { useChatStore, type Conversation } from "@/stores/chat-store";
import { usePersonalizationStore } from "@/stores/personalization-store";
import { useToast } from "@/stores/toast-store";

export default function ChatsSettingsPage() {
    const router = useRouter();
    const { success, error: toastError } = useToast();
    const clearMessages = useChatStore((state) => state.clearMessages);
    const privateChatMode = usePersonalizationStore((state) => state.privateChatMode);
    const setPrivateChatMode = usePersonalizationStore((state) => state.setPrivateChatMode);
    const [isDeleting, setIsDeleting] = useState(false);
    const [archivedConversations, setArchivedConversations] = useState<Conversation[]>([]);
    const [isLoadingArchived, setIsLoadingArchived] = useState(true);
    const [feedback, setFeedback] = useState<string | null>(null);

    useEffect(() => {
        const fetchArchived = async () => {
            try {
                const response = await fetch("/api/conversations?archived=true");
                if (!response.ok) {
                    throw new Error("Failed to load archived conversations");
                }

                const data = await response.json();
                setArchivedConversations(data.conversations || []);
            } catch (error: unknown) {
                const errorMessage =
                    error instanceof Error ? error.message : "Failed to load archived conversations";
                setFeedback(errorMessage);
            } finally {
                setIsLoadingArchived(false);
            }
        };

        void fetchArchived();
    }, []);

    const handleDeleteAll = async () => {
        if (!confirm("Delete all conversations? This cannot be undone.")) {
            return;
        }

        setIsDeleting(true);
        setFeedback(null);

        try {
            const response = await fetch("/api/conversations", { method: "DELETE" });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete conversations");
            }

            clearMessages();
            setFeedback("All conversations deleted.");
            success("All conversations deleted");
            router.push("/chat");
            router.refresh();
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Failed to delete conversations";
            setFeedback(errorMessage);
            toastError("Delete failed", errorMessage);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRestoreConversation = async (id: string) => {
        setFeedback(null);

        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived: false }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to restore conversation");
            }

            setArchivedConversations((prev) => prev.filter((conversation) => conversation.id !== id));
            setFeedback("Conversation restored.");
            success("Conversation restored");
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Failed to restore conversation";
            setFeedback(errorMessage);
            toastError("Restore failed", errorMessage);
        }
    };

    const handleDeleteArchivedConversation = async (id: string) => {
        if (!confirm("Delete this archived conversation?")) {
            return;
        }

        setFeedback(null);

        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete archived conversation");
            }

            setArchivedConversations((prev) => prev.filter((conversation) => conversation.id !== id));
            setFeedback("Archived conversation deleted.");
            success("Archived conversation deleted");
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Failed to delete archived conversation";
            setFeedback(errorMessage);
            toastError("Delete failed", errorMessage);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="section-kicker mb-3">Chats</div>
                <h2 className="text-4xl font-semibold tracking-tight">Conversation management</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Manage how your chat history behaves today, and track the larger organization
                    features that are still pending.
                </p>
            </div>

            <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                            <EyeOff className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold">Private chat mode</h3>
                            <p className="text-sm text-muted-foreground">
                                Keep current-session chats out of saved conversation history.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setPrivateChatMode(!privateChatMode)}
                        className="flex w-full items-center justify-between rounded-[1.25rem] border border-border/70 bg-background/30 px-4 py-4 text-left"
                    >
                        <div>
                            <div className="font-medium">
                                {privateChatMode ? "Private mode enabled" : "Private mode disabled"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                When enabled, new chats stream normally but are not persisted.
                            </div>
                        </div>
                        <div className={`h-6 w-11 rounded-full p-1 ${privateChatMode ? "bg-primary" : "bg-muted"}`}>
                            <div
                                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                    privateChatMode ? "translate-x-5" : "translate-x-0"
                                }`}
                            />
                        </div>
                    </button>
                </div>

                <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                            <Trash2 className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold">Delete all conversations</h3>
                            <p className="text-sm text-muted-foreground">
                                Clear your entire persisted chat history from the current account.
                            </p>
                        </div>
                    </div>

                    <Button
                        variant="destructive"
                        onClick={handleDeleteAll}
                        disabled={isDeleting}
                        className="rounded-full"
                    >
                        <Trash2 className="h-4 w-4" />
                        {isDeleting ? "Deleting..." : "Delete everything"}
                    </Button>
                </div>

                <div className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                            <Archive className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold">Archive chats</h3>
                            <p className="text-sm text-muted-foreground">
                                Archived chats are hidden from the main sidebar and can be restored here.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {isLoadingArchived ? (
                            <div className="rounded-2xl border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground">
                                Loading archived conversations...
                            </div>
                        ) : archivedConversations.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground">
                                No archived conversations yet.
                            </div>
                        ) : (
                            archivedConversations.map((conversation) => (
                                <div
                                    key={conversation.id}
                                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/20 px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate font-medium">{conversation.title}</div>
                                        <div className="truncate text-xs text-muted-foreground">
                                            {conversation.lastMessage?.content || "Archived conversation"}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleRestoreConversation(conversation.id)}
                                            className="rounded-full"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            Restore
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => handleDeleteArchivedConversation(conversation.id)}
                                            className="rounded-full"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>

            <section className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                        <MessageSquareDashed className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold">Pending chat organization features</h3>
                        <p className="text-sm text-muted-foreground">
                            These are the next higher-value workspace improvements inspired by Qwen/Grok.
                        </p>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    {["Archive chats", "Projects/grouping", "Language selector", "Voice mode"].map((item) => (
                        <div
                            key={item}
                            className="rounded-2xl border border-border/70 bg-background/20 px-4 py-3 text-sm text-muted-foreground"
                        >
                            {item}
                        </div>
                    ))}
                </div>

                {feedback ? (
                    <div className="mt-4 rounded-2xl border border-border/70 bg-background/20 px-4 py-3 text-sm">
                        {feedback}
                    </div>
                ) : null}
            </section>
        </div>
    );
}
