// src/components/chat/ChatContainer.tsx
// ────────────────────────────────────────────────────────────────
// Main chat container that combines all chat components.
// ────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat, loadOlderMessages } from "@/hooks/useChat";
import { usePreferences } from "@/hooks/usePreferences";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { cn } from "@/lib/utils";
import { AlertCircle, EyeOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useChatStore } from "@/stores/chat-store";
import { usePersonalizationStore } from "@/stores/personalization-store";

interface ChatContainerProps {
    conversationId?: string | null;
    className?: string;
}

export function ChatContainer({ conversationId, className }: ChatContainerProps) {
    const { preferences } = usePreferences();
    const {
        providerId, modelId, activeProjectId, setModel, bumpListVersion,
        messages: storeMessages,
    } = useChatStore();
    const privateChatMode = usePersonalizationStore((state) => state.privateChatMode);
    const hasAppliedDefaults = useRef(false);
    // A conversation is announced to the sidebar exactly once: the first turn
    // that creates it. Without this the list is only visible after a reload.
    const announcedConversationId = useRef<string | null>(null);
    const handleTurnComplete = useCallback((id: string) => {
        if (announcedConversationId.current === id) {
            return;
        }
        announcedConversationId.current = id;
        bumpListVersion();
    }, [bumpListVersion]);
    // Stable identity: loadConversation closes over this, and the load effect
    // keys on loadConversation. An inline closure would be a new function every
    // render, re-running the load on every render — a fetch storm (measured:
    // ~90 identical transcript reads opening one thread).
    const handleChatError = useCallback((err: Error) => {
        console.error("Chat error:", err);
    }, []);
    const {
        messages,
        input,
        isLoading,
        error,
        handleInputChange,
        handleSubmit,
        handleStop,
        loadConversation,
    } = useChat({
        conversationId: privateChatMode ? null : conversationId,
        projectId: activeProjectId,
        systemPrompt: preferences?.defaultSystemPrompt,
        privateMode: privateChatMode,
        onComplete: handleTurnComplete,
        onError: handleChatError,
    });

    useEffect(() => {
        if (conversationId || hasAppliedDefaults.current || storeMessages.length > 0) {
            return;
        }

        const defaultProviderId = preferences?.defaultProviderId;
        const defaultModelId = preferences?.defaultModelId;

        if (
            defaultProviderId &&
            defaultModelId &&
            (providerId !== defaultProviderId || modelId !== defaultModelId)
        ) {
            setModel(defaultProviderId, defaultModelId);
        }

        hasAppliedDefaults.current = true;
    }, [
        conversationId,
        preferences?.defaultModelId,
        preferences?.defaultProviderId,
        providerId,
        modelId,
        setModel,
        storeMessages.length,
    ]);

    useEffect(() => {
        if (!conversationId || privateChatMode) {
            return;
        }

        void loadConversation(conversationId);
    }, [conversationId, loadConversation, privateChatMode]);

    return (
        <main className={cn("flex min-h-0 flex-1 flex-col", className)}>
            {privateChatMode ? (
                <div className="flex-shrink-0 px-4 pt-4">
                    <Alert className="border-border/70 bg-background/35">
                        <EyeOff className="h-4 w-4" />
                        <AlertTitle>Private chat mode</AlertTitle>
                        <AlertDescription>
                            Messages in this session are not saved to conversation history.
                        </AlertDescription>
                    </Alert>
                </div>
            ) : null}

            {/* Error Display */}
            {error && (
                <div className="flex-shrink-0 p-4">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>
                            {error || "An error occurred while sending your message."}
                        </AlertDescription>
                    </Alert>
                </div>
            )}

            {/* Message List - takes remaining space */}
            <div className="min-h-0 flex-1">
                <MessageList
                    messages={messages}
                    isLoading={isLoading}
                    showTokenCount={preferences?.showTokenCount ?? false}
                    onLoadOlder={loadOlderMessages}
                />
            </div>

            {/* Input - fixed at bottom */}
            <div className="flex-shrink-0">
                <ChatInput
                    value={input}
                    isLoading={isLoading}
                    sendWithEnter={preferences?.sendWithEnter ?? true}
                    onChange={handleInputChange}
                    onSubmit={handleSubmit}
                    onStop={handleStop}
                />
            </div>
        </main>
    );
}
