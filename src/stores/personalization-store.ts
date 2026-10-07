"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_WELCOME_MESSAGE } from "@/lib/constants";

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
            setPrivateChatMode: (privateChatMode) => set({ privateChatMode }),
            setSidebarDefaultState: (sidebarDefaultState) => set({ sidebarDefaultState }),
            setWelcomeMessage: (welcomeMessage) => set({ welcomeMessage }),
        }),
        {
            name: "omnichat-personalization",
            storage: createJSONStorage(() => localStorage),
        }
    )
);
