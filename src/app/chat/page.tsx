// src/app/chat/page.tsx
// ────────────────────────────────────────────────────────────────
// Main chat page with sidebar and chat container.
// ────────────────────────────────────────────────────────────────

"use client";

import { ConversationSidebar } from "@/components/sidebar";
import { ChatContainer, ModelSelector } from "@/components/chat";
import { useChatStore } from "@/stores/chat-store";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
    const { isSidebarOpen, toggleSidebar } = useChatStore();

    return (
        <div className="flex h-screen">
            {/* Sidebar */}
            <ConversationSidebar />

            {/* Main Content */}
            <div className="flex flex-1 flex-col">
                {/* Header */}
                <header className="flex h-14 items-center justify-between border-b px-4">
                    <div className="flex items-center gap-2">
                        {!isSidebarOpen && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleSidebar}
                                className="h-8 w-8"
                            >
                                <PanelLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <h1 className="text-lg font-semibold">Chat</h1>
                    </div>
                    <ModelSelector />
                </header>

                {/* Chat Area */}
                <ChatContainer />
            </div>
        </div>
    );
}
