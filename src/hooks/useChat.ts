// src/hooks/useChat.ts
// ────────────────────────────────────────────────────────────────
// Custom useChat hook for OmniChat.
// Handles streaming responses from multi-provider chat API.
// ────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useRef, useState } from "react";
import { useChatStore, type Message } from "@/stores/chat-store";

interface UseOmniChatOptions {
    conversationId?: string | null;
    projectId?: string | null;
    systemPrompt?: string;
    privateMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    onComplete?: (conversationId: string) => void;
    onError?: (error: Error) => void;
}

function createMessageId(): string {
    if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function useChat(options: UseOmniChatOptions = {}) {
    const {
        projectId,
        systemPrompt,
        privateMode = false,
        temperature = 0.7,
        maxTokens = 4096,
        onComplete,
        onError,
    } = options;

    const {
        providerId,
        modelId,
        conversationId,
        setConversationId,
        setConversationTitle,
        messages,
        setMessages,
        addMessage,
        removeMessage,
        updateLastMessage,
    } = useChatStore();

    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const handleSubmit = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            
            if (!input.trim() || isLoading) return;

            // Create user message
            const userMessage = input.trim();
            setInput("");

            // Add user message to store
            addMessage({
                id: createMessageId(),
                role: "user",
                content: userMessage,
                createdAt: new Date().toISOString(),
            });

            // Add empty assistant message for streaming
            const assistantMsgId = createMessageId();
            addMessage({
                id: assistantMsgId,
                role: "assistant",
                content: "",
                modelId,
                providerId,
                createdAt: new Date().toISOString(),
            });

            setIsLoading(true);
            setError(null);

            // Create abort controller for this request
            abortControllerRef.current = new AbortController();

            try {
                const response = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: [{ role: "user", content: userMessage }],
                        providerId,
                        modelId,
                        conversationId: privateMode ? undefined : conversationId,
                        projectId: privateMode ? undefined : projectId ?? undefined,
                        privateMode,
                        systemPrompt,
                        temperature,
                        maxTokens,
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Failed to send message");
                }

                // Get conversation ID from response header
                const newConversationId = response.headers.get("X-Conversation-Id");
                if (newConversationId && !privateMode && !conversationId) {
                    setConversationId(newConversationId);
                }

                // Handle streaming response
                const reader = response.body?.getReader();
                const decoder = new TextDecoder();

                if (!reader) {
                    throw new Error("No response body");
                }

                let accumulatedContent = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedContent += chunk;

                    // Update the assistant message with streamed content
                    updateLastMessage(accumulatedContent);
                }

                // Update with final content
                updateLastMessage(accumulatedContent);

                if (newConversationId && !privateMode) {
                    onComplete?.(newConversationId);
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name === "AbortError") {
                    // User cancelled the request
                    return;
                }

                console.error("Chat error:", err);
                const errorMessage = err instanceof Error ? err.message : "An error occurred";
                setError(errorMessage);
                onError?.(err as Error);

                // Remove the empty assistant message on error
                removeMessage(assistantMsgId);
            } finally {
                setIsLoading(false);
                abortControllerRef.current = null;
            }
        },
        [
            input,
            isLoading,
            providerId,
            modelId,
            conversationId,
            projectId,
            privateMode,
            systemPrompt,
            temperature,
            maxTokens,
            addMessage,
            updateLastMessage,
            setConversationId,
            removeMessage,
            onComplete,
            onError,
        ]
    );

    // Stop generation
    const handleStop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    // Clear messages and reset conversation
    const clearMessages = useCallback(() => {
        setMessages([]);
        setConversationId(null);
        setConversationTitle("New Chat");
        setInput("");
        setError(null);
    }, [setMessages, setConversationId, setConversationTitle]);

    // Load existing conversation
    const loadConversation = useCallback(
        async (id: string) => {
            try {
                const response = await fetch(`/api/conversations/${id}`);
                if (!response.ok) throw new Error("Failed to load conversation");

                const data = await response.json();
                const loadedMessages: Message[] = data.messages.map((m: { id: string; role: string; content: string; modelId?: string; providerId?: string; tokenCount?: number; createdAt: string }) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    modelId: m.modelId,
                    providerId: m.providerId,
                    tokenCount: m.tokenCount,
                    createdAt: m.createdAt,
                }));

                setMessages(loadedMessages);
                setConversationId(id);
                setConversationTitle(data.title);
            } catch (err) {
                console.error("Failed to load conversation:", err);
            }
        },
        [setMessages, setConversationId, setConversationTitle]
    );

    // Handle input change
    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => {
            setInput(e.target.value);
        },
        []
    );

    return {
        // State
        messages,
        input,
        isLoading,
        error,
        conversationId,

        // Actions
        handleInputChange,
        handleSubmit,
        handleStop,
        clearMessages,
        loadConversation,
        setInput,
        setMessages,
    };
}
