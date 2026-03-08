// src/components/chat/ChatContainer.tsx
// ────────────────────────────────────────────────────────────────
// Main chat container that combines all chat components.
// ────────────────────────────────────────────────────────────────

"use client";

import { useChat } from "@/hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ChatContainerProps {
    conversationId?: string | null;
    className?: string;
}

export function ChatContainer({ conversationId, className }: ChatContainerProps) {
    const {
        messages,
        input,
        isLoading,
        error,
        handleInputChange,
        handleSubmit,
        handleStop,
    } = useChat({
        conversationId,
        onError: (err) => {
            console.error("Chat error:", err);
        },
    });

    return (
        <div className={cn("flex h-full flex-col", className)}>
            {/* Error Display */}
            {error && (
                <div className="p-4">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>
                            {error || "An error occurred while sending your message."}
                        </AlertDescription>
                    </Alert>
                </div>
            )}

            {/* Message List */}
            <MessageList messages={messages} isLoading={isLoading} />

            {/* Input */}
            <ChatInput
                value={input}
                isLoading={isLoading}
                onChange={handleInputChange}
                onSubmit={handleSubmit}
                onStop={handleStop}
            />
        </div>
    );
}
