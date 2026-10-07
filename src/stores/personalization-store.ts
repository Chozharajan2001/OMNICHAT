"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_WELCOME_MESSAGE } from "@/lib/constants";
import { useChatStore } from "@/stores/chat-store";

export type ChatDensity = "comfortable" | "compact";
export type AppLanguage = "en-US" | "en-GB" | "ta-IN";
export type SidebarDefaultState = "expanded" | "collapsed";

interface PersonalizationState {
    language: AppLanguage;
    chatDensity: ChatDensity;
    privateChatMode: boolean;
    sidebarDefaultState: SidebarDefaultState;
    welcomeMessage: string;
    setLanguage: (language: AppLanguage) => void;
    setChatDensity: (density: ChatDensity) => void;
    setPrivateChatMode: (enabled: boolean) => void;
    setSidebarDefaultState: (state: SidebarDefaultState) => void;
    setWelcomeMessage: (message: string) => void;
}

export const usePersonalizationStore = create<PersonalizationState>()(
    persist(
        (set) => ({
            language: "en-US",
            chatDensity: "comfortable",
            privateChatMode: false,
            sidebarDefaultState: "expanded",
            welcomeMessage: DEFAULT_WELCOME_MESSAGE,
            setLanguage: (language) => set({ language }),
            setChatDensity: (chatDensity) => set({ chatDensity }),
            // Private mode sends whatever the chat store holds (useChat builds
            // the transcript from the store, not from the database), so the
            // transcript has to change with the mode either way: keeping the
            // saved conversation on screen made the first "private" turn ship
            // that conversation to the provider, and keeping the private
            // exchange on screen left unsaved text in what looks like a saved
            // session. Clearing here covers every toggle site; on /chat/[id] the
            // conversation is re-read as soon as private mode is left.
            setPrivateChatMode: (privateChatMode) => {
                set({ privateChatMode });
                useChatStore.getState().clearMessages();
            },
            setSidebarDefaultState: (sidebarDefaultState) => set({ sidebarDefaultState }),
            setWelcomeMessage: (welcomeMessage) => set({ welcomeMessage }),
        }),
        {
            name: "omnichat-personalization",
            storage: createJSONStorage(() => localStorage),
        }
    )
);
