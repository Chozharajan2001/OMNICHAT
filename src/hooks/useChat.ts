// src/hooks/useChat.ts
// ────────────────────────────────────────────────────────────────
// Custom useChat hook for OmniChat.
// Handles streaming responses from multi-provider chat API.
// ────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useRef, useState } from "react";
import { useChatStore, type Message } from "@/stores/chat-store";
import { CHAT_MAX_REQUEST_MESSAGES, STREAM_ERROR_MARKER } from "@/lib/constants";

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

interface TranscriptMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/**
 * Private mode never touches the database, so the only history the provider can
 * see is what this request carries. The route already forwards the whole
 * `messages` array when privateMode is set (src/app/api/chat/route.ts:160-162)
 * and prepareMessages does the context trimming -- it was the client that sent
 * one message and made every private turn a fresh conversation.
 */
function buildTranscript(messages: TranscriptMessage[], userMessage: string, privateMode: boolean): TranscriptMessage[] {
    if (!privateMode) return [{ role: "user", content: userMessage }];
    // Newest wins: the request schema rejects the whole array past
    // CHAT_MAX_REQUEST_MESSAGES, so an unbounded transcript does not grow
    // forever -- at turn ~100 every send starts failing with a 400 and the
    // private chat becomes unusable mid-session. Room is left for the message
    // being added now.
    return [
        ...messages
            .filter((message) => message.content.trim() !== "")
            .slice(-(CHAT_MAX_REQUEST_MESSAGES - 1))
            .map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content: userMessage },
    ];
}

/**
 * The route appends a stream failure after this marker. It belongs in the error
 * channel, not in the assistant message: kept as message text it would be shown
 * as though the model wrote it and, in private mode, replayed to the provider on
 * every later turn.
 */
function splitStreamNotice(text: string): { answer: string; notice: string | null } {
    const at = text.indexOf(STREAM_ERROR_MARKER);
    if (at < 0) return { answer: text, notice: null };
    return {
        answer: text.slice(0, at).trimEnd(),
        notice: text.slice(at + STREAM_ERROR_MARKER.length).trim(),
    };
}

/**
 * The route segment owns the conversation id on /chat/[id]; the store owns it on
 * /chat. Reading only the store meant a message sent before loadConversation()
 * resolved went to whichever conversation the store was still holding -- or
 * started a second one -- while the URL said otherwise.
 */
function pickConversationId(
    fromRoute: string | null | undefined,
    fromStore: string | null
): string | null {
    return fromRoute ?? fromStore;
}

export function useChat(options: UseOmniChatOptions = {}) {
    const {
        conversationId: conversationIdProp,
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
        conversationId: storedConversationId,
        setConversationId,
        setConversationTitle,
        messages,
        setMessages,
        addMessage,
        removeMessage,
        updateMessage,
    } = useChatStore();

    // The route segment owns the conversation id on /chat/[id]; the store owns
    // it on /chat. handleSubmit's dependency list carries this value, so the
    // closure is always current and no ref is needed to read it later.
    const conversationId = pickConversationId(conversationIdProp, storedConversationId);

    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const currentAssistantMsgIdRef = useRef<string | null>(null);
    const accumulatedContentRef = useRef<string>("");

    const handleSubmit = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            
            if (!input.trim() || isLoading) return;

            // Create user message
            const userMessage = input.trim();
            setInput("");

            const transcript = buildTranscript(messages, userMessage, privateMode);

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
            currentAssistantMsgIdRef.current = assistantMsgId;
            accumulatedContentRef.current = "";

            try {
                const response = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: transcript,
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
                    // Error bodies are not guaranteed to be JSON (proxies,
                    // 5xx HTML pages); never let parsing mask the real error.
                    let message = `Failed to send message (${response.status})`;
                    try {
                        const errorData = await response.json();
                        if (typeof errorData?.error === "string") {
                            message = errorData.error;
                        }
                    } catch {
                        // keep the status-based message
                    }
                    throw new Error(message);
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
                    accumulatedContentRef.current = accumulatedContent;

                    // Update THIS turn's assistant message by id. If the
                    // user switched conversations mid-stream the message is
                    // gone and the update is a safe no-op instead of
                    // overwriting another conversation's last message.
                    // The marker and whatever follows it are never shown as
                    // answer text, so they cannot flash before the split below.
                    updateMessage(assistantMsgId, splitStreamNotice(accumulatedContent).answer);
                }

                // Final pass: the answer and an appended stream failure are
                // different things and belong in different channels -- the
                // message body and the error banner.
                const { answer, notice } = splitStreamNotice(accumulatedContent);
                updateMessage(assistantMsgId, answer);
                setError(notice);

                if (newConversationId && !privateMode) {
                    onComplete?.(newConversationId);
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name === "AbortError") {
                    // User cancelled the request. Keep the partial answer; drop
                    // the empty message -- where "empty" means no answer text,
                    // ignoring a notice that may have arrived with the abort.
                    if (splitStreamNotice(accumulatedContentRef.current).answer.trim() === ""
                        && currentAssistantMsgIdRef.current) {
                        removeMessage(currentAssistantMsgIdRef.current);
                    }
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
                currentAssistantMsgIdRef.current = null;
                accumulatedContentRef.current = "";
            }
        },
        [
            input,
            isLoading,
            messages,
            providerId,
            modelId,
            conversationId,
            projectId,
            privateMode,
            systemPrompt,
            temperature,
            maxTokens,
            addMessage,
            updateMessage,
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
                // Surface the failure instead of silently showing an empty
                // or stale transcript.
                console.error("Failed to load conversation:", err);
                setError("Failed to load conversation");
                onError?.(err as Error);
            }
        },
        [setMessages, setConversationId, setConversationTitle, onError]
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
