import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation, Message, Prisma, Project } from "@prisma/client";

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
    message: {
        findFirst: vi.fn<(args: Prisma.MessageFindFirstArgs) => Promise<Message | null>>(),
        findMany: vi.fn<(args: Prisma.MessageFindManyArgs) => Promise<Message[]>>(),
    },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
    createConversation,
    getConversationMeta,
    getConversations,
    getMessagesPaginated,
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

describe("getMessagesPaginated (D2)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function msg(id: string, createdAt: string): Message {
        return {
            id,
            conversationId: "conv-1",
            role: "user",
            content: id,
            modelId: null,
            providerId: null,
            tokenCount: null,
            cost: null,
            createdAt: new Date(createdAt),
        } as Message;
    }

    function ownConversation() {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: "conv-1" });
    }

    it("returns the latest window first with no cursor", async () => {
        ownConversation();
        mockPrisma.message.findMany.mockResolvedValueOnce([
            msg("m3", "2026-10-05T08:00:03.000Z"),
            msg("m2", "2026-10-05T08:00:02.000Z"),
            msg("m1", "2026-10-05T08:00:01.000Z"),
        ]);

        const page = await getMessagesPaginated("conv-1", "user-123", { limit: 2 });

        // Stored newest-first, handed back oldest-first for rendering: the
        // window is the two newest, and the popped lookahead is the oldest.
        expect(page.messages.map((m) => m.id)).toEqual(["m2", "m3"]);
        expect(page.hasMorePrev).toBe(true);
        expect(page.hasMoreNext).toBe(false);
        expect(page.prevCursor).toEqual({ id: "m2" });
        expect(page.nextCursor).toEqual({ id: "m3" });
        expect(mockPrisma.message.findMany.mock.calls[0][0].orderBy).toEqual([
            { createdAt: "desc" },
            { id: "desc" },
        ]);
    });

    it("pages older than the cursor without repeating it", async () => {
        ownConversation();
        const anchor = msg("m3", "2026-10-05T08:00:03.000Z");
        mockPrisma.message.findFirst.mockResolvedValueOnce(anchor);
        mockPrisma.message.findMany.mockResolvedValueOnce([
            msg("m2", "2026-10-05T08:00:02.000Z"),
        ]);

        const page = await getMessagesPaginated("conv-1", "user-123", { cursor: "m3", limit: 5 });

        expect(page.messages.map((m) => m.id)).toEqual(["m2"]);
        expect(page.hasMorePrev).toBe(false);
        // The anchor row itself is newer than this window.
        expect(page.hasMoreNext).toBe(true);
        const where = mockPrisma.message.findMany.mock.calls[0][0].where as {
            OR: unknown[];
        };
        expect(where.OR).toHaveLength(2);
    });

    it("pages newer than the cursor in ascending order", async () => {
        ownConversation();
        const anchor = msg("m1", "2026-10-05T08:00:01.000Z");
        mockPrisma.message.findFirst.mockResolvedValueOnce(anchor);
        mockPrisma.message.findMany.mockResolvedValueOnce([
            msg("m2", "2026-10-05T08:00:02.000Z"),
            msg("m3", "2026-10-05T08:00:03.000Z"),
        ]);

        const page = await getMessagesPaginated("conv-1", "user-123", {
            cursor: "m1",
            direction: "next",
            limit: 1,
        });

        expect(page.messages.map((m) => m.id)).toEqual(["m2"]);
        expect(page.hasMoreNext).toBe(true);
        expect(page.hasMorePrev).toBe(true);
    });

    it("reports an empty window honestly", async () => {
        ownConversation();
        mockPrisma.message.findMany.mockResolvedValueOnce([]);

        const page = await getMessagesPaginated("conv-1", "user-123");

        expect(page.messages).toEqual([]);
        expect(page.hasMorePrev).toBe(false);
        expect(page.hasMoreNext).toBe(false);
        expect(page.prevCursor).toBeNull();
        expect(page.nextCursor).toBeNull();
    });

    it("refuses another user's conversation before touching messages", async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

        await expect(getMessagesPaginated("conv-1", "user-123")).rejects.toThrow(
            "Conversation not found or access denied"
        );
        expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it("rejects a cursor naming no message in this conversation", async () => {
        ownConversation();
        mockPrisma.message.findFirst.mockResolvedValueOnce(null);

        await expect(
            getMessagesPaginated("conv-1", "user-123", { cursor: "m-gone" })
        ).rejects.toThrow("Invalid message cursor");
        expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it("clamps an absurd limit instead of fetching unbounded", async () => {
        ownConversation();
        mockPrisma.message.findMany.mockResolvedValueOnce([]);

        await getMessagesPaginated("conv-1", "user-123", { limit: 5000 });

        expect(mockPrisma.message.findMany.mock.calls[0][0].take).toBe(101);
    });

    it("reads conversation metadata without the transcript", async () => {
        const meta = { id: "conv-1", userId: "user-123", title: "T" };
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(meta);

        await expect(getConversationMeta("conv-1", "user-123")).resolves.toBe(meta);
    });
});
