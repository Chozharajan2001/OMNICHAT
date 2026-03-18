"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Archive, FolderOpen, MessageSquare, Trash2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/stores/chat-store";

interface ProjectOption {
    id: string;
    name: string;
}

interface ConversationListProps {
    conversations: Conversation[];
    activeConversationId: string | null;
    isLoading: boolean;
    projects: ProjectOption[];
    onAssignProject: (conversationId: string, projectId: string | null) => void;
    onArchive: (id: string, e: React.MouseEvent) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onSelect?: () => void;
}

export function ConversationList({
    conversations,
    activeConversationId,
    isLoading,
    projects,
    onAssignProject,
    onArchive,
    onDelete,
    onSelect,
}: ConversationListProps) {
    if (isLoading) {
        return <div className="px-2 py-4 text-sm text-muted-foreground">Loading conversations...</div>;
    }

    if (conversations.length === 0) {
        return (
            <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground">
                No conversations yet. Start one and it will appear here.
            </div>
        );
    }

    return (
        <>
            {conversations.map((conversation) => (
                <Link
                    key={conversation.id}
                    href={`/chat/${conversation.id}`}
                    onClick={onSelect}
                    className={cn(
                        "group flex items-center gap-3 rounded-[1.25rem] border px-3 py-3 text-sm transition-colors",
                        activeConversationId === conversation.id
                            ? "border-primary/25 bg-primary/12"
                            : "border-transparent bg-transparent hover:border-border/70 hover:bg-background/30"
                    )}
                >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-background/40 text-muted-foreground">
                        <MessageSquare className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{conversation.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                            {conversation.lastMessage?.content || "Ready to continue"}
                        </div>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100"
                            >
                                <FolderOpen className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Move to project</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onAssignProject(conversation.id, null)}>
                                No project
                            </DropdownMenuItem>
                            {projects.length === 0 ? (
                                <DropdownMenuItem disabled>No projects available</DropdownMenuItem>
                            ) : (
                                projects.map((project) => (
                                    <DropdownMenuItem
                                        key={project.id}
                                        onClick={() => onAssignProject(conversation.id, project.id)}
                                    >
                                        {project.name}
                                    </DropdownMenuItem>
                                ))
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100"
                        onClick={(e) => onArchive(conversation.id, e)}
                    >
                        <Archive className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100"
                        onClick={(e) => onDelete(conversation.id, e)}
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </Link>
            ))}
        </>
    );
}
