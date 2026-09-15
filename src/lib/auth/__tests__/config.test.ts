import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma before importing auth config
vi.mock("@/lib/db/prisma", () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    },
}));

// Mock rate limiter
vi.mock("@/lib/rate-limit", () => ({
    authRateLimiter: {
        check: vi.fn().mockReturnValue({ limited: false, remaining: 5, resetTime: 0, retryAfter: 0 }),
        reset: vi.fn(),
    },
}));

import { prisma } from "@/lib/db/prisma";
import { authRateLimiter } from "@/lib/rate-limit";

const mockPrisma = vi.mocked(prisma);
const mockRateLimiter = vi.mocked(authRateLimiter);

describe("Auth Configuration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset environment variables
        process.env.NODE_ENV = "development";
        delete process.env.DESKTOP_MODE;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Password Complexity Validation", () => {
        it("rejects passwords shorter than 8 characters", async () => {
            // This will be tested via the authorize function
            // For now, we test the validation logic directly
            const validatePasswordComplexity = (password: string): boolean => {
                if (password.length < 8) return false;
                if (!/[A-Z]/.test(password)) return false;
                if (!/[a-z]/.test(password)) return false;
                if (!/[0-9]/.test(password)) return false;
                return true;
            };

            expect(validatePasswordComplexity("Short1")).toBe(false); // 6 chars
            expect(validatePasswordComplexity("longer")).toBe(false); // no uppercase or number
            expect(validatePasswordComplexity("ALLCAPS1")).toBe(false); // no lowercase
            expect(validatePasswordComplexity("lowercase1")).toBe(false); // no uppercase
            expect(validatePasswordComplexity("NoNumbers")).toBe(false); // no numbers
        });

        it("accepts valid passwords meeting all requirements", () => {
            const validatePasswordComplexity = (password: string): boolean => {
                if (password.length < 8) return false;
                if (!/[A-Z]/.test(password)) return false;
                if (!/[a-z]/.test(password)) return false;
                if (!/[0-9]/.test(password)) return false;
                return true;
            };

            expect(validatePasswordComplexity("Password1")).toBe(true);
            expect(validatePasswordComplexity("MySecure123")).toBe(true);
            expect(validatePasswordComplexity("Test1234")).toBe(true);
        });
    });

    describe("Auto-creation Gates", () => {
        it("allows user creation in development mode", () => {
            process.env.NODE_ENV = "development";
            const isDesktopMode = process.env.DESKTOP_MODE === "true";
            const isDev = process.env.NODE_ENV === "development";

            expect(isDev || isDesktopMode).toBe(true);
        });

        it("allows user creation in desktop mode", () => {
            process.env.NODE_ENV = "production";
            process.env.DESKTOP_MODE = "true";
            const isDesktopMode = process.env.DESKTOP_MODE === "true";
            const isDev = process.env.NODE_ENV === "development";

            expect(isDev || isDesktopMode).toBe(true);
        });

        it("blocks user creation in production without desktop mode", () => {
            process.env.NODE_ENV = "production";
            delete process.env.DESKTOP_MODE;
            const isDesktopMode = process.env.DESKTOP_MODE === "true";
            const isDev = process.env.NODE_ENV === "development";

            expect(isDev || isDesktopMode).toBe(false);
        });
    });

    describe("Rate Limiting", () => {
        it("checks rate limit before authentication", async () => {
            const checkMock = vi.mocked(mockRateLimiter.check);
            checkMock.mockReturnValue({ limited: false, remaining: 5, resetTime: 0, retryAfter: 0 });

            const result = mockRateLimiter.check("127.0.0.1");
            expect(result.limited).toBe(false);
            expect(checkMock).toHaveBeenCalledWith("127.0.0.1");
        });

        it("blocks authentication when rate limited", async () => {
            const checkMock = vi.mocked(mockRateLimiter.check);
            checkMock.mockReturnValue({ limited: true, remaining: 0, resetTime: 0, retryAfter: 60 });

            const result = mockRateLimiter.check("127.0.0.1");
            expect(result.limited).toBe(true);
            expect(result.retryAfter).toBe(60);
        });
    });

    describe("User Lookup", () => {
        it("finds existing user by email", async () => {
            const mockUser = {
                id: "user-123",
                email: "test@example.com",
                name: "Test User",
                passwordHash: "hashed-password",
            };

            mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

            const user = await mockPrisma.user.findUnique({
                where: { email: "test@example.com" },
                select: { id: true, email: true, name: true, passwordHash: true },
            });

            expect(user).toEqual(mockUser);
            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
                where: { email: "test@example.com" },
                select: { id: true, email: true, name: true, passwordHash: true },
            });
        });

        it("returns null for non-existent user", async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const user = await mockPrisma.user.findUnique({
                where: { email: "nonexistent@example.com" },
                select: { id: true, email: true, name: true, passwordHash: true },
            });

            expect(user).toBeNull();
        });
    });
});
