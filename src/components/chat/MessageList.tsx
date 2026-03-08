// src/components/chat/MessageList.tsx
// ────────────────────────────────────────────────────────────────
// Renders the list of messages in a conversation.
// ────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
    id: string;
    role: "system" | "user" | "assistant";
    content: string;
    createdAt?: string;
}

interface MessageListProps {
    messages: Message[];
    isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    if (messages.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="text-4xl">💬</div>
                <div>
                    <h2 className="text-lg font-semibold">Start a conversation</h2>
                    <p className="text-muted-foreground">
                        Send a message to begin chatting with AI
                    </p>
                </div>
            </div>
        );
    }

    return (
        <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="flex flex-col">
                {messages.map((message, index) => (
                    <MessageBubble
                        key={message.id || index}
                        role={message.role}
                        content={message.content}
                        isStreaming={
                            isLoading &&
                            index === messages.length - 1 &&
                            message.role === "assistant"
                        }
                    />
                ))}
            </div>
        </ScrollArea>
    );
}
