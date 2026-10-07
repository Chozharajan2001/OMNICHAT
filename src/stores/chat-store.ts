// src/stores/chat-store.ts
// ────────────────────────────────────────────────────────────────
// Global chat state management using Zustand.
// Handles model selection, conversation state, and user preferences.
// ────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Conversation {
    id: string;
    title: string;
    providerId: string;
    modelId: string;
    projectId?: string | null;
    updatedAt: string;
    archivedAt?: string | null;
    lastMessage?: {
        content: string;
        role: string;
    } | null;
}

export interface Message {
    id: string;
    role: "system" | "user" | "assistant";
    content: string;
    modelId?: string;
    providerId?: string;
    tokenCount?: number;
    createdAt: string;
}

interface ChatState {
    // Current model selection
    providerId: string;
    modelId: string;
    activeProjectId: string | null;

    // Current conversation
    conversationId: string | null;
    conversationTitle: string;
    messages: Message[];

    // UI state
    isSidebarOpen: boolean;

    // Ephemeral list-refresh token. Bumped when a turn creates a conversation
    // the sidebar has never been told about; the sidebar passes it as the
    // refresh key of its /api/conversations read. Not persisted: a reload
    // re-fetches the list anyway.
    listVersion: number;

    // Actions
    setProviderId: (id: string) => void;
    setModelId: (id: string) => void;
    setModel: (providerId: string, modelId: string) => void;
    setActiveProjectId: (id: string | null) => void;

    setConversationId: (id: string | null) => void;
    setConversationTitle: (title: string) => void;
    setMessages: (messages: Message[]) => void;
    addMessage: (message: Message) => void;
    removeMessage: (id: string) => void;
    updateMessage: (id: string, content: string) => void;
    clearMessages: () => void;

    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    bumpListVersion: () => void;
}

export const useChatStore = create<ChatState>()(
    persist(
        (set) => ({
            // Default values
            providerId: "openai",
            modelId: "gpt-4o",
            activeProjectId: null,
            conversationId: null,
            conversationTitle: "New Chat",
            messages: [],
            isSidebarOpen: true,
            listVersion: 0,

            // Model selection actions
            setProviderId: (id) => set({ providerId: id }),
            setModelId: (id) => set({ modelId: id }),
            setModel: (providerId, modelId) => set({ providerId, modelId }),
            setActiveProjectId: (activeProjectId) => set({ activeProjectId }),

            // Conversation actions
            setConversationId: (id) => set({ conversationId: id }),
            setConversationTitle: (title) => set({ conversationTitle: title }),
            setMessages: (messages) => set({ messages }),
            addMessage: (message) =>
                set((state) => ({ messages: [...state.messages, message] })),
            removeMessage: (id) =>
                set((state) => ({
                    messages: state.messages.filter((message) => message.id !== id),
                })),
            // Id-targeted update: a stream must only ever write to its own
            // message. The old positional updateLastMessage could overwrite
            // the last message of a DIFFERENT conversation the user switched
            // to mid-stream.
            updateMessage: (id, content) =>
                set((state) => ({
                    messages: state.messages.map((message) =>
                        message.id === id ? { ...message, content } : message
                    ),
                })),
            clearMessages: () => set({ messages: [], conversationId: null, conversationTitle: "New Chat" }),

            // UI actions
            toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
            setSidebarOpen: (open) => set({ isSidebarOpen: open }),
            bumpListVersion: () => set((state) => ({ listVersion: state.listVersion + 1 })),
        }),
        {
            name: "omnichat-chat-store",
            partialize: (state) => ({
                providerId: state.providerId,
                modelId: state.modelId,
                activeProjectId: state.activeProjectId,
                isSidebarOpen: state.isSidebarOpen,
            }),
        }
    )
);
