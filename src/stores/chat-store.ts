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
    updatedAt: string;
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
    createdAt: string;
}

interface ChatState {
    // Current model selection
    providerId: string;
    modelId: string;

    // Current conversation
    conversationId: string | null;
    conversationTitle: string;
    messages: Message[];

    // UI state
    isSidebarOpen: boolean;

    // Actions
    setProviderId: (id: string) => void;
    setModelId: (id: string) => void;
    setModel: (providerId: string, modelId: string) => void;

    setConversationId: (id: string | null) => void;
    setConversationTitle: (title: string) => void;
    setMessages: (messages: Message[]) => void;
    addMessage: (message: Message) => void;
    updateLastMessage: (content: string) => void;
    clearMessages: () => void;

    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatState>()(
    persist(
        (set) => ({
            // Default values
            providerId: "openai",
            modelId: "gpt-4o",
            conversationId: null,
            conversationTitle: "New Chat",
            messages: [],
            isSidebarOpen: true,

            // Model selection actions
            setProviderId: (id) => set({ providerId: id }),
            setModelId: (id) => set({ modelId: id }),
            setModel: (providerId, modelId) => set({ providerId, modelId }),

            // Conversation actions
            setConversationId: (id) => set({ conversationId: id }),
            setConversationTitle: (title) => set({ conversationTitle: title }),
            setMessages: (messages) => set({ messages }),
            addMessage: (message) =>
                set((state) => ({ messages: [...state.messages, message] })),
            updateLastMessage: (content) =>
                set((state) => {
                    const messages = [...state.messages];
                    if (messages.length > 0) {
                        messages[messages.length - 1] = {
                            ...messages[messages.length - 1],
                            content,
                        };
                    }
                    return { messages };
                }),
            clearMessages: () => set({ messages: [], conversationId: null, conversationTitle: "New Chat" }),

            // UI actions
            toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
            setSidebarOpen: (open) => set({ isSidebarOpen: open }),
        }),
        {
            name: "omnichat-chat-store",
            partialize: (state) => ({
                providerId: state.providerId,
                modelId: state.modelId,
                isSidebarOpen: state.isSidebarOpen,
            }),
        }
    )
);
