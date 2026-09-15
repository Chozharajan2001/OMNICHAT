import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma
vi.mock("@/lib/db/prisma", () => ({
    prisma: {
        conversation: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
        project: {
            findUnique: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/db/prisma";
import {
    createConversation,
    getConversationWithMessages,
    updateConversation,
    deleteConversation,
} from "../conversations";

const mockPrisma = vi.mocked(prisma);

describe("Conversation Queries", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("createConversation", () => {
        it("creates a conversation without project", async () => {
            const mockConversation = {
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

            mockPrisma.conversation.create.mockResolvedValue(mockConversation as any);

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
            const mockProject = {
                id: "project-123",
                userId: "user-123",
                name: "Test Project",
                color: "#7c6dff",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockConversation = {
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

            mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
            mockPrisma.conversation.create.mockResolvedValue(mockConversation as any);

            await createConversation("user-123", "openai", "gpt-4o", {
                projectId: "project-123",
            });

            expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
                where: { id: "project-123" },
            });
        });

        it("throws error when project belongs to different user", async () => {
            const mockProject = {
                id: "project-123",
                userId: "different-user",
                name: "Other Project",
                color: "#7c6dff",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);

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
            const mockConversation = {
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

            mockPrisma.conversation.create.mockResolvedValue(mockConversation as any);

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
            const mockConversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test Chat",
                messages: [
                    { id: "msg-1", role: "user", content: "Hello", conversationId: "conv-123" },
                    { id: "msg-2", role: "assistant", content: "Hi there", conversationId: "conv-123" },
                ],
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation as any);

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
            const mockConversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Old Title",
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation as any);
            mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, title: "New Title" } as any);

            await updateConversation("conv-123", "user-123", { title: "New Title" });

            expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
                where: { id: "conv-123" },
            });
        });

        it("throws error when updating conversation belonging to different user", async () => {
            const mockConversation = {
                id: "conv-123",
                userId: "different-user",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation as any);

            await expect(
                updateConversation("conv-123", "user-123", { title: "New Title" })
            ).rejects.toThrow("Conversation not found or access denied");
        });

        it("verifies project ownership when changing projectId", async () => {
            const mockConversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
                projectId: null,
            };

            const mockProject = {
                id: "project-123",
                userId: "user-123",
                name: "Test Project",
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation as any);
            mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
            mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, projectId: "project-123" } as any);

            await updateConversation("conv-123", "user-123", { projectId: "project-123" });

            expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
                where: { id: "project-123" },
            });
        });

        it("throws error when assigning to project belonging to different user", async () => {
            const mockConversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
                projectId: null,
            };

            const mockProject = {
                id: "project-123",
                userId: "different-user",
                name: "Other Project",
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation as any);
            mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);

            await expect(
                updateConversation("conv-123", "user-123", { projectId: "project-123" })
            ).rejects.toThrow("Project not found or access denied");
        });
    });

    describe("deleteConversation", () => {
        it("verifies ownership before deletion", async () => {
            const mockConversation = {
                id: "conv-123",
                userId: "user-123",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation as any);
            mockPrisma.conversation.delete.mockResolvedValue(mockConversation as any);

            await deleteConversation("conv-123", "user-123");

            expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
                where: { id: "conv-123" },
            });
        });

        it("throws error when deleting conversation belonging to different user", async () => {
            const mockConversation = {
                id: "conv-123",
                userId: "different-user",
                providerId: "openai",
                modelId: "gpt-4o",
                title: "Test",
            };

            mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation as any);

            await expect(
                deleteConversation("conv-123", "user-123")
            ).rejects.toThrow("Conversation not found or access denied");
        });
    });
});
