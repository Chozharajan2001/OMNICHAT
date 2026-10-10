"use client";

import { useEffect, useMemo, useState } from "react";
import { useJsonResource } from "@/hooks/useJsonResource";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChatStore, type Conversation } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ConversationList } from "./ConversationList";
import { ProjectList, type ProjectSummary } from "./ProjectList";
import {
    Command,
    PanelLeft,
    PanelLeftClose,
    Plus,
    Search,
    Settings,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersonalizationStore } from "@/stores/personalization-store";
import { useToast } from "@/stores/toast-store";
import { MAX_PAGE_SIZE } from "@/lib/constants";

// A 400 from the API carries the reason (a project name clash, for instance);
// a bare "creation failed" made that look like a malfunction.
function failureDetail(error: unknown): string | undefined {
    return error instanceof Error && error.message ? error.message : undefined;
}

// The list page is asked for at the largest size the API will serve (it
// clamps to MAX_PAGE_SIZE). A typed query is also sent as `?q=` (debounced),
// so titles beyond the loaded page are found server-side; the in-memory filter
// below then applies project scope and last-message matching over the page.
const SIDEBAR_CONVERSATION_LIMIT = MAX_PAGE_SIZE;

// One request per pause, not per keystroke: without the debounce every letter
// refetches the list and the responses race.
const SEARCH_DEBOUNCE_MS = 250;

interface ConversationPage {
    conversations: Conversation[];
    nextCursor?: { id: string } | null;
}

// Its own component because ConversationSidebar has spent its branch budget.
function SearchScopeNotice({ truncated, hasQuery }: { truncated: boolean; hasQuery: boolean }) {
    // During a search the server is the owner: it filters all titles and
    // reports no further pages, so no scope caveat applies. The list's
    // emptyMessage carries the no-match case.
    if (!truncated || hasQuery) return null;
    return (
        <p className="px-1 pt-2 text-xs leading-5 text-muted-foreground">
            Showing the {SIDEBAR_CONVERSATION_LIMIT} most recent chats.
        </p>
    );
}

/**
 * Only one component may describe an empty list, or the two messages contradict
 * each other: a filtered-out list is not an account with nothing in it. The
 * wording lives here so ConversationSidebar's own complexity stays unchanged.
 */
function conversationListHint(searchQuery: string): string {
    const query = searchQuery.trim();
    return query
        ? `No chat in this list matches “${query}”.`
        : "No conversations yet. Start one and it will appear here.";
}

export function ConversationSidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const {
        activeProjectId,
        conversationId,
        clearMessages,
        isSidebarOpen,
        listVersion,
        setActiveProjectId,
        toggleSidebar,
        setSidebarOpen,
    } = useChatStore();
    const { success, error: toastError } = useToast();

    const [isDesktop, setIsDesktop] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const conversationsUrl =
        `/api/conversations?limit=${SIDEBAR_CONVERSATION_LIMIT}` +
        (debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : "");

    const { data: conversationData, loading: isLoading, refresh: fetchConversations, setData: setConversationData } =
        useJsonResource<ConversationPage>(
            conversationsUrl,
            "Failed to fetch conversations",
            `${pathname}#${listVersion}`
        );
    const { data: projectData, loading: isLoadingProjects, refresh: fetchProjects } =
        useJsonResource<{ projects: ProjectSummary[] }>("/api/projects", "Failed to fetch projects", pathname);
    const conversations = useMemo(() => conversationData?.conversations ?? [], [conversationData]);
    const projects = projectData?.projects ?? [];
    const setConversations = (update: (previous: Conversation[]) => Conversation[]) =>
        setConversationData((current) => ({
            // Spread first: a local archive/delete must keep nextCursor, or the
            // truncation notice would silently vanish mid-list.
            ...current,
            conversations: update(current?.conversations ?? []),
        }));
    const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{ type: "conversation" | "project"; id: string } | null>(null);
    const sidebarDefaultState = usePersonalizationStore((state) => state.sidebarDefaultState);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 1024px)");

        const applyViewportMode = () => {
            const desktop = mediaQuery.matches;
            setIsDesktop(desktop);

            if (desktop) {
                setSidebarOpen(sidebarDefaultState === "expanded");
            } else {
                setSidebarOpen(false);
            }
        };

        applyViewportMode();
        mediaQuery.addEventListener("change", applyViewportMode);

        return () => {
            mediaQuery.removeEventListener("change", applyViewportMode);
        };
    }, [setSidebarOpen, sidebarDefaultState]);

    useEffect(() => {
        if (!isDesktop) {
            setSidebarOpen(false);
        }
    }, [pathname, isDesktop, setSidebarOpen]);

    const handleNewChat = () => {
        clearMessages();
        if (!isDesktop) {
            setSidebarOpen(false);
        }
        router.push("/chat");
    };

    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDeleteConfirmDialog({ type: "conversation", id });
    };

    const confirmDeleteConversation = async () => {
        if (!deleteConfirmDialog || deleteConfirmDialog.type !== "conversation") return;
        const id = deleteConfirmDialog.id;

        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error(`Delete rejected with ${response.status}`);
            }

            setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
            if (conversationId === id) {
                clearMessages();
                router.push("/chat");
            }
            success("Conversation deleted");
        } catch (error) {
            console.error("Failed to delete conversation:", error);
            toastError("Delete failed");
        } finally {
            setDeleteConfirmDialog(null);
        }
    };

    const handleArchiveConversation = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived: true }),
            });

            if (!response.ok) {
                throw new Error(`Archive rejected with ${response.status}`);
            }

            setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
            if (conversationId === id) {
                clearMessages();
                router.push("/chat");
            }
            success("Conversation archived");
        } catch (error) {
            console.error("Failed to archive conversation:", error);
            toastError("Archive failed");
        }
    };

    const handleAssignProject = async (id: string, projectId: string | null) => {
        try {
            const response = await fetch(`/api/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId }),
            });

            if (!response.ok) {
                throw new Error("Failed to update project");
            }

            await fetchConversations();
            success(projectId ? "Conversation moved" : "Project removed");
        } catch (error) {
            console.error("Failed to assign project:", error);
            toastError("Project update failed");
        }
    };

    const handleCreateProject = () => {
        setNewProjectName("");
        setShowNewProjectDialog(true);
    };

    const handleCreateProjectSubmit = async () => {
        const name = newProjectName.trim();
        if (!name) {
            return;
        }

        try {
            const response = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create project");
            }

            await fetchProjects();
            setShowNewProjectDialog(false);
            setNewProjectName("");
            success("Project created");
        } catch (error) {
            console.error("Failed to create project:", error);
            toastError("Project creation failed", failureDetail(error));
        }
    };

    const handleDeleteProject = (projectId: string) => {
        setDeleteConfirmDialog({ type: "project", id: projectId });
    };

    const confirmDeleteProject = async () => {
        if (!deleteConfirmDialog || deleteConfirmDialog.type !== "project") return;
        const projectId = deleteConfirmDialog.id;

        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                throw new Error("Failed to delete project");
            }

            if (activeProjectId === projectId) {
                setActiveProjectId(null);
            }

            await fetchProjects();
            await fetchConversations();
            success("Project deleted");
        } catch (error) {
            console.error("Failed to delete project:", error);
            toastError("Project delete failed");
        } finally {
            setDeleteConfirmDialog(null);
        }
    };

    const handleConfirmDelete = () => {
        if (deleteConfirmDialog?.type === "conversation") {
            confirmDeleteConversation();
        } else {
            confirmDeleteProject();
        }
    };

    const closeMobileSidebar = () => {
        if (!isDesktop) {
            setSidebarOpen(false);
        }
    };

    const filteredConversations = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const scoped = activeProjectId
            ? conversations.filter((conversation) => conversation.projectId === activeProjectId)
            : conversations;

        if (!query) {
            return scoped;
        }

        return scoped.filter((conversation) => {
            const title = conversation.title.toLowerCase();
            const lastMessage = conversation.lastMessage?.content?.toLowerCase() || "";
            return title.includes(query) || lastMessage.includes(query);
        });
    }, [activeProjectId, conversations, searchQuery]);

    return (
        <>
            {!isDesktop && isSidebarOpen ? (
                <button
                    type="button"
                    aria-label="Close sidebar"
                    className="fixed inset-0 z-30 bg-black/45 backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            ) : null}

            <aside
                // Off-canvas is not enough: a translated sidebar stays in the
                // tab order and the accessibility tree, so keyboard users walk
                // through invisible controls. inert removes both at once.
                inert={!isSidebarOpen}
                className={cn(
                    "glass-panel fixed inset-y-0 left-0 z-40 flex h-dvh flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-all duration-300",
                    "w-[min(88vw,22rem)]",
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full",
                    "lg:relative lg:z-0 lg:translate-x-0",
                    isSidebarOpen ? "lg:w-72" : "lg:w-0 lg:overflow-hidden"
                )}
            >
                <div className="flex h-20 items-center justify-between border-b border-[var(--sidebar-border)] px-4">
                    <Link href="/chat" className="flex items-center gap-3" onClick={closeMobileSidebar}>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/18 text-primary shadow-[0_0_40px_var(--shadow-primary)]">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                            <div className="text-sm font-semibold tracking-[0.22em] text-muted-foreground">
                                OMNICHAT
                            </div>
                            <div className="text-sm font-medium text-foreground/90">
                                Personal AI desk
                            </div>
                        </div>
                    </Link>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                        className="h-11 w-11 shrink-0 rounded-full border border-border/60 bg-background/40"
                    >
                        {isSidebarOpen ? (
                            <PanelLeftClose className="h-4 w-4" />
                        ) : (
                            <PanelLeft className="h-4 w-4" />
                        )}
                    </Button>
                </div>

                <div className="space-y-3 p-3">
                    <Button
                        onClick={handleNewChat}
                        className="w-full justify-start gap-2 rounded-2xl border-0 bg-primary py-6 text-primary-foreground shadow-[0_16px_40px_var(--shadow-primary)]"
                    >
                        <Plus className="h-4 w-4" />
                        New Conversation
                    </Button>

                    <div className="rounded-2xl border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                        <div className="mb-1 flex items-center gap-2 font-medium text-foreground/80">
                            <Command className="h-3.5 w-3.5 text-primary" />
                            Personalization
                        </div>
                        Shape the workspace with preferred models, prompts, and theme settings.
                    </div>

                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search chats"
                            className="h-11 rounded-2xl border-border/70 bg-background/40 pl-9"
                        />
                    </div>

                    <SearchScopeNotice
                        truncated={!!conversationData?.nextCursor}
                        hasQuery={searchQuery.trim() !== ""}
                    />
                </div>

                <Separator />

                <ScrollArea className="flex-1">
                    <div className="space-y-3 p-3">
                        <ProjectList
                            projects={projects}
                            activeProjectId={activeProjectId}
                            isLoading={isLoadingProjects}
                            onCreate={handleCreateProject}
                            onSelect={setActiveProjectId}
                            onDelete={handleDeleteProject}
                        />

                        <Separator />
                        <div className="section-kicker px-1">Recent chats</div>
                        <ConversationList
                            conversations={filteredConversations}
                            activeConversationId={conversationId}
                            isLoading={isLoading}
                            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
                            onAssignProject={handleAssignProject}
                            onArchive={handleArchiveConversation}
                            onDelete={handleDeleteConversation}
                            onSelect={closeMobileSidebar}
                            emptyMessage={conversationListHint(searchQuery)}
                        />
                    </div>
                </ScrollArea>

                <Separator />

                <div className="p-3">
                    <Button
                        asChild
                        variant="ghost"
                        className="w-full justify-start gap-2 rounded-2xl border border-border/70 bg-background/30 py-6"
                    >
                        <Link href="/settings/preferences" onClick={closeMobileSidebar}>
                            <Settings className="h-4 w-4" />
                            Settings & Personalization
                        </Link>
                    </Button>
                </div>
            </aside>

            {/* New Project Dialog */}
            <Modal
                open={showNewProjectDialog}
                title="New Project"
                showCloseButton
                onClose={() => setShowNewProjectDialog(false)}
            >
                <div className="space-y-4">
                    <Input
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Project name"
                        className="h-11 rounded-xl"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleCreateProjectSubmit();
                            }
                        }}
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            className="flex-1 rounded-xl"
                            onClick={() => setShowNewProjectDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="flex-1 rounded-xl"
                            onClick={handleCreateProjectSubmit}
                            disabled={!newProjectName.trim()}
                        >
                            Create
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Dialog */}
            <Modal
                open={!!deleteConfirmDialog}
                title={deleteConfirmDialog?.type === "conversation" ? "Delete Conversation" : "Delete Project"}
                showCloseButton
                onClose={() => setDeleteConfirmDialog(null)}
            >
                <p className="mb-6 text-sm text-muted-foreground">
                    {deleteConfirmDialog?.type === "conversation"
                        ? "Are you sure you want to delete this conversation? This action cannot be undone."
                        : "Delete this project? Conversations will remain and be unassigned."}
                </p>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        className="flex-1 rounded-xl"
                        onClick={() => setDeleteConfirmDialog(null)}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        className="flex-1 rounded-xl"
                        onClick={handleConfirmDelete}
                    >
                        Delete
                    </Button>
                </div>
            </Modal>
        </>
    );
}
