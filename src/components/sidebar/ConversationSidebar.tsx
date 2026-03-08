// src/components/sidebar/ConversationSidebar.tsx
// ────────────────────────────────────────────────────────────────
// Sidebar with conversation list and new chat button.
// ────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChatStore, type Conversation } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    Plus,
    MessageSquare,
    Settings,
    Trash2,
    PanelLeftClose,
    PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ConversationSidebar() {
    const router = useRouter();
    const {
        conversationId,
        clearMessages,
        isSidebarOpen,
        toggleSidebar,
    } = useChatStore();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch conversations
    useEffect(() => {
        const fetchConversations = async () => {
            try {
                const response = await fetch("/api/conversations");
                if (response.ok) {
                    const data = await response.json();
                    setConversations(data.conversations || []);
                }
            } catch (error) {
                console.error("Failed to fetch conversations:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchConversations();
    }, []);

    const handleNewChat = () => {
        clearMessages();
        router.push("/chat");
    };

    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm("Delete this conversation?")) return;

        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                setConversations((prev) => prev.filter((c) => c.id !== id));
                if (conversationId === id) {
                    clearMessages();
                    router.push("/chat");
                }
            }
        } catch (error) {
            console.error("Failed to delete conversation:", error);
        }
    };

    return (
        <div
            className={cn(
                "flex h-full flex-col border-r bg-background transition-all duration-300",
                isSidebarOpen ? "w-64" : "w-0 overflow-hidden"
            )}
        >
            {/* Header */}
            <div className="flex h-14 items-center justify-between border-b px-4">
                <Link href="/chat" className="font-bold">
                    OmniChat
                </Link>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    className="h-8 w-8"
                >
                    {isSidebarOpen ? (
                        <PanelLeftClose className="h-4 w-4" />
                    ) : (
                        <PanelLeft className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {/* New Chat Button */}
            <div className="p-2">
                <Button
                    onClick={handleNewChat}
                    className="w-full justify-start gap-2"
                    variant="outline"
                >
                    <Plus className="h-4 w-4" />
                    New Chat
                </Button>
            </div>

            <Separator />

            {/* Conversations List */}
            <ScrollArea className="flex-1">
                <div className="space-y-1 p-2">
                    {isLoading ? (
                        <div className="p-2 text-sm text-muted-foreground">
                            Loading...
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                            No conversations yet
                        </div>
                    ) : (
                        conversations.map((conversation) => (
                            <Link
                                key={conversation.id}
                                href={`/chat/${conversation.id}`}
                                className={cn(
                                    "group flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted",
                                    conversationId === conversation.id &&
                                        "bg-muted"
                                )}
                            >
                                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="flex-1 truncate">
                                    {conversation.title}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                    onClick={(e) =>
                                        handleDeleteConversation(
                                            conversation.id,
                                            e
                                        )
                                    }
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </Link>
                        ))
                    )}
                </div>
            </ScrollArea>

            <Separator />

            {/* Footer */}
            <div className="p-2">
                <Link href="/settings/providers">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-2"
                    >
                        <Settings className="h-4 w-4" />
                        Settings
                    </Button>
                </Link>
            </div>
        </div>
    );
}
