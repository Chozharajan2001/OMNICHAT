// src/hooks/useChat.ts
// ────────────────────────────────────────────────────────────────
// Custom useChat hook for OmniChat.
// Handles streaming responses from multi-provider chat API.
// ────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useRef, useState } from "react";
import { useChatStore, type Message, type MessagePageInfo } from "@/stores/chat-store";
import { CHAT_MAX_REQUEST_MESSAGES, DEFAULT_MESSAGE_PAGE_SIZE, STREAM_ERROR_MARKER } from "@/lib/constants";

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

interface StoredMessageRow {
    id: string;
    role: string;
    content: string;
    modelId?: string;
    providerId?: string;
    tokenCount?: number;
    createdAt: string;
}

// One reader for both message endpoints: the shape is shared, and two copies
// of this literal have already drifted once (tokenCount dropped on one path).
function toStoreMessages(rows: StoredMessageRow[]): Message[] {
    return rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        modelId: m.modelId,
        providerId: m.providerId,
        tokenCount: m.tokenCount,
        createdAt: m.createdAt,
    })) as Message[];
}

export interface OlderMessagePage extends MessagePageInfo {
    messages: Message[];
}

function pageInfoOf(data: { hasMorePrev?: unknown; prevCursor?: { id?: unknown } | null }): MessagePageInfo {
    return {
        hasMorePrev: data.hasMorePrev === true,
        prevCursor:
            data.prevCursor && typeof data.prevCursor.id === "string" ? data.prevCursor.id : null,
    };
}

/**
 * A window older than `cursor`. Pure fetch: the caller prepends to the store,
 * so a failed page leaves the visible transcript untouched.
 */
export async function fetchOlderPage(
    conversationId: string,
    cursor: string
): Promise<OlderMessagePage> {
    const response = await fetch(
        `/api/conversations/${conversationId}?limit=${DEFAULT_MESSAGE_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}&direction=prev`
    );
    if (!response.ok) throw new Error("Failed to load older messages");

    const data = await response.json();
    return {
        messages: toStoreMessages((data.messages ?? []) as StoredMessageRow[]),
        ...pageInfoOf(data),
    };
}

// Older windows prepend above the visible transcript; a failed page leaves it
// untouched. Module scope, not a useCallback inside useChat: hook-level
// callbacks are numbered into the complexity baseline, and inserting one
// renumbers every callback after it. Reads the store directly so no component
// effect is involved. Only reachable while a window with a cursor is on
// screen, which private mode never sets.
export async function loadOlderMessages(): Promise<void> {
    const state = useChatStore.getState();
    const cursor = state.page?.prevCursor;
    if (!state.conversationId || !cursor) return;
    try {
        const older = await fetchOlderPage(state.conversationId, cursor);
        const current = useChatStore.getState();
        current.setMessages([...older.messages, ...current.messages]);
        current.setPage({ hasMorePrev: older.hasMorePrev, prevCursor: older.prevCursor });
    } catch (err) {
        console.error("Failed to load older messages:", err);
    }
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

    // Load existing conversation: the latest window, not the whole transcript.
    // Threads past one page show "Load older messages" instead of paying the
    // full history cost up front; sending still works off server-side history.
    // The window lives in the store next to the messages, so no effect in any
    // component has to synchronize the two (and a fresh canvas clears both).
    const loadConversation = useCallback(
        async (id: string): Promise<void> => {
            try {
                const response = await fetch(
                    `/api/conversations/${id}?limit=${DEFAULT_MESSAGE_PAGE_SIZE}`
                );
                if (!response.ok) throw new Error("Failed to load conversation");

                const data = await response.json();
                const loadedMessages = toStoreMessages(data.messages as StoredMessageRow[]);

                setMessages(loadedMessages);
                setConversationId(id);
                setConversationTitle(data.title);
                useChatStore.getState().setPage(pageInfoOf(data));
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
