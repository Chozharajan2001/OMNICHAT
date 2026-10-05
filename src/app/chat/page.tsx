// src/app/chat/page.tsx
// ────────────────────────────────────────────────────────────────
// Main chat page with sidebar and chat container.
// ────────────────────────────────────────────────────────────────

"use client";

import { ConversationSidebar } from "@/components/sidebar";
import { ChatContainer, ModelSelector } from "@/components/chat";
import { useChatStore } from "@/stores/chat-store";
import { Compass, PanelLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
    const { isSidebarOpen, toggleSidebar } = useChatStore();

    return (
        <div className="app-shell flex h-dvh overflow-hidden">
            {/* Sidebar */}
            <ConversationSidebar />

            {/* Main Content */}
            <div className="flex h-full flex-1 flex-col overflow-hidden">
                {/* Header */}
                <header className="glass-panel z-20 flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b px-4 md:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        {!isSidebarOpen && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleSidebar}
                                aria-label="Open sidebar"
                                className="h-11 w-11 shrink-0 rounded-full border border-border/70 bg-background/40"
                            >
                                <PanelLeft className="h-4 w-4" />
                            </Button>
                        )}
                        {/* The wordmark is decoration; below sm it would push the
                            model selector off the right edge, so it yields. */}
                        <div className="hidden min-w-0 space-y-0.5 sm:block">
                            <div className="section-kicker flex items-center gap-2">
                                <Sparkles className="h-3 w-3" />
                                OmniChat Workspace
                            </div>
                            <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
                                <Compass className="h-4 w-4 text-primary" />
                                <span className="truncate">Start a conversation</span>
                            </div>
                        </div>
                    </div>
                    <ModelSelector />
                </header>

                {/* Chat Area */}
                <ChatContainer className="px-3 pb-4 pt-3 md:px-6 md:pb-6" />
            </div>
        </div>
    );
}
