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
