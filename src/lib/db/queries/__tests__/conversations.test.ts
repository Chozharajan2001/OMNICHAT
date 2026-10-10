import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation, Prisma, Project } from "@prisma/client";

type ConversationWithMessages = Prisma.ConversationGetPayload<{
    include: { messages: true };
}>;

// Use concrete query signatures rather than casting generic Prisma methods.
const mockPrisma = vi.hoisted(() => ({
    conversation: {
        create: vi.fn<(args: Prisma.ConversationCreateArgs) => Promise<Conversation>>(),
        findUnique: vi.fn<
            (args: Prisma.ConversationFindUniqueArgs) => Promise<Conversation | ConversationWithMessages | null>
        >(),
        findMany: vi.fn<(args: Prisma.ConversationFindManyArgs) => Promise<ConversationWithMessages[]>>(),
        findFirst: vi.fn<(args: Prisma.ConversationFindFirstArgs) => Promise<{ id: string } | null>>(),
        update: vi.fn<(args: Prisma.ConversationUpdateArgs) => Promise<Conversation>>(),
        delete: vi.fn<(args: Prisma.ConversationDeleteArgs) => Promise<Conversation>>(),
        deleteMany: vi.fn<(args: Prisma.ConversationDeleteManyArgs) => Promise<Prisma.BatchPayload>>(),
    },
    project: {
        findUnique: vi.fn<(args: Prisma.ProjectFindUniqueArgs) => Promise<Project | null>>(),
    },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
    createConversation,
    getConversations,
    findConversationCursor,
    getConversationWithMessages,
    updateConversation,
    deleteConversation,
} from "../conversations";

describe("Conversation Queries", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("createConversation", () => {
        it("creates a conversation without project", async () => {
            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "New Chat",
                projectId: null,
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.conversation.create.mockResolvedValue(mockConversation);

            const result = await createConversation("user-123", "openai", "gpt-4o", {
                title: "New Chat",
            });

            expect(result).toEqual(mockConversation);
            expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
                data: {
                    userId: "user-123",
                    providerId: "openai",
                    modelId: "gpt-4o",
                    title: "New Chat",
                    projectId: undefined,
                    folderId: undefined,
                    systemPrompt: undefined,
                },
            });
        });

        it("verifies project ownership when projectId is provided", async () => {
            const mockProject: Project = {
                id: "project-123",
                userId: "user-123",
                name: "Test Project",
                color: "#7c6dff",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "New Chat",
                projectId: "project-123",
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.project.findUnique.mockResolvedValue(mockProject);
            mockPrisma.conversation.create.mockResolvedValue(mockConversation);

            await createConversation("user-123", "openai", "gpt-4o", {
                projectId: "project-123",
            });

            expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
                where: { id: "project-123" },
            });
        });

        it("throws error when project belongs to different user", async () => {
            const mockProject: Project = {
                id: "project-123",
                userId: "different-user",
                name: "Other Project",
                color: "#7c6dff",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.project.findUnique.mockResolvedValue(mockProject);

            await expect(
                createConversation("user-123", "openai", "gpt-4o", {
                    projectId: "project-123",
                })
            ).rejects.toThrow("Project not found or access denied");
        });

        it("throws error when project does not exist", async () => {
            mockPrisma.project.findUnique.mockResolvedValue(null);

            await expect(
                createConversation("user-123", "openai", "gpt-4o", {
                    projectId: "nonexistent",
                })
            ).rejects.toThrow("Project not found or access denied");
        });

        it("stores systemPrompt when provided", async () => {
            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "New Chat",
                projectId: null,
                folderId: null,
                systemPrompt: "You are a helpful assistant",
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.conversation.create.mockResolvedValue(mockConversation);

            await createConversation("user-123", "openai", "gpt-4o", {
                systemPrompt: "You are a helpful assistant",
            });

            expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
                data: {
                    userId: "user-123",
                    providerId: "openai",
                    modelId: "gpt-4o",
                    title: "New Chat",
                    projectId: undefined,
                    folderId: undefined,
                    systemPrompt: "You are a helpful assistant",
                },
            });
        });
    });

    describe("getConversationWithMessages", () => {
        it("returns conversation with messages for owner", async () => {
            const mockConversation: ConversationWithMessages = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test Chat",
                projectId: null,
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                messages: [
                    {
                        id: "msg-1",
                        role: "user",
                        content: "Hello",
                        conversationId: "conv-123",
                        modelId: null,
                        providerId: null,
                        tokenCount: null,
                        cost: null,
                        createdAt: new Date(),
                    },
                    {
                        id: "msg-2",
                        role: "assistant",
                        content: "Hi there",
                        conversationId: "conv-123",
                        modelId: null,
                        providerId: null,
                        tokenCount: null,
                        cost: null,
                        createdAt: new Date(),
                    },
                ],
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

            const result = await getConversationWithMessages("conv-123", "user-123");

            expect(result).toEqual(mockConversation);
            expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
                where: { id: "conv-123", userId: "user-123" },
                include: { messages: { orderBy: { createdAt: "asc" } } },
            });
        });

        it("returns null for conversation belonging to different user", async () => {
            mockPrisma.conversation.findUnique.mockResolvedValue(null);

            const result = await getConversationWithMessages("conv-123", "user-123");

            expect(result).toBeNull();
        });
    });

    describe("updateConversation", () => {
        it("verifies conversation ownership before update", async () => {
            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Old Title",
                projectId: null,
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
            mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, title: "New Title" });

            await updateConversation("conv-123", "user-123", { title: "New Title" });

            expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
                where: { id: "conv-123" },
            });
        });

        it("throws error when updating conversation belonging to different user", async () => {
            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "different-user",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
                projectId: null,
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

            await expect(
                updateConversation("conv-123", "user-123", { title: "New Title" })
            ).rejects.toThrow("Conversation not found or access denied");
        });

        it("verifies project ownership when changing projectId", async () => {
            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
                projectId: null,
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockProject: Project = {
                id: "project-123",
                userId: "user-123",
                name: "Test Project",
                color: "#7c6dff",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
            mockPrisma.project.findUnique.mockResolvedValue(mockProject);
            mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, projectId: "project-123" });

            await updateConversation("conv-123", "user-123", { projectId: "project-123" });

            expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
                where: { id: "project-123" },
            });
        });

        it("throws error when assigning to project belonging to different user", async () => {
            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
                projectId: null,
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockProject: Project = {
                id: "project-123",
                userId: "different-user",
                name: "Other Project",
                color: "#7c6dff",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
            mockPrisma.project.findUnique.mockResolvedValue(mockProject);

            await expect(
                updateConversation("conv-123", "user-123", { projectId: "project-123" })
            ).rejects.toThrow("Project not found or access denied");
        });
    });

    describe("deleteConversation", () => {
        it("verifies ownership before deletion", async () => {
            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
                projectId: null,
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
            mockPrisma.conversation.delete.mockResolvedValue(mockConversation);

            await deleteConversation("conv-123", "user-123");

            expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
                where: { id: "conv-123" },
            });
        });

        it("throws error when deleting conversation belonging to different user", async () => {
            const mockConversation: Conversation = {
                id: "conv-123",
                userId: "different-user",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
                projectId: null,
                folderId: null,
                systemPrompt: null,
                archivedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

            await expect(
                deleteConversation("conv-123", "user-123")
            ).rejects.toThrow("Conversation not found or access denied");
        });
    });
});

describe("getConversations pagination contract (2.5)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function row(id: string) {
        return {
            id,
            userId: "user-123",
            title: id,
            providerId: "openai",
            modelId: "gpt-4o",
            systemPrompt: null,
            projectId: null,
            archivedAt: null,
            createdAt: new Date("2026-10-05T08:00:00.000Z"),
            updatedAt: new Date("2026-10-05T08:00:00.000Z"),
            messages: [],
        } as unknown as ConversationWithMessages;
    }

    it("seeks by the unique id and orders with a tiebreaker", async () => {
        mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

        await getConversations("user-123", 2, { id: "conv-anchor" });

        const args = mockPrisma.conversation.findMany.mock.calls[0][0];
        expect(args.cursor).toEqual({ id: "conv-anchor" });
        // updatedAt alone is not unique: two rows touched in the same instant
        // tie, and a page resuming at a tie either repeats or skips a row.
        expect(args.orderBy).toEqual([{ updatedAt: "desc" }, { id: "desc" }]);
    });

    it("hands back only the id as the next cursor", async () => {
        mockPrisma.conversation.findMany.mockResolvedValueOnce([row("a"), row("b"), row("c")]);

        const page = await getConversations("user-123", 2);

        expect(page.conversations.map((c) => c.id)).toEqual(["a", "b"]);
        expect(page.nextCursor).toEqual({ id: "c" });
        // Prisma seeks INCLUSIVE of the cursor row, so the popped lookahead is
        // the row the next page starts at and no skip may accompany it: pairing
        // that cursor with skip:1 drops one conversation per page boundary.
        expect(mockPrisma.conversation.findMany.mock.calls[0][0].skip).toBeUndefined();
    });

    it("ends the page when there is no extra row", async () => {
        mockPrisma.conversation.findMany.mockResolvedValueOnce([row("a")]);

        const page = await getConversations("user-123", 2);

        expect(page.nextCursor).toBeNull();
    });

    it("filters titles when q is supplied and ignores a blank q", async () => {
        mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

        await getConversations("user-123", 2, undefined, { q: "  alpha  " });

        const args = mockPrisma.conversation.findMany.mock.calls[0][0];
        expect(args.where).toMatchObject({ userId: "user-123", title: { contains: "alpha" } });
    });

    it("leaves the title predicate out when q is blank", async () => {
        mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

        await getConversations("user-123", 2, undefined, { q: "   " });

        const args = mockPrisma.conversation.findMany.mock.calls[0][0];
        expect(args.where).not.toHaveProperty("title");
    });
});

describe("findConversationCursor (2.5)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("resolves a cursor only against rows the caller owns", async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: "c-anchor" });

        const cursor = await findConversationCursor("user-123", "c-anchor", false);

        expect(cursor).toEqual({ id: "c-anchor" });
        // Ownership lives in the lookup itself: a cursor naming someone else's
        // row must not resolve, or their list would be seeked from that row.
        expect(mockPrisma.conversation.findFirst.mock.calls[0][0].where).toEqual({
            userId: "user-123",
            id: "c-anchor",
            archivedAt: null,
        });
    });

    it("resolves to null for a cursor that names no owned row", async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

        await expect(findConversationCursor("user-123", "c-gone", true)).resolves.toBeNull();
    });
});
