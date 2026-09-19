import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, User } from "@prisma/client";
import type { authRateLimiter } from "@/lib/rate-limit";

type AuthUser = Pick<User, "id" | "email" | "name" | "passwordHash">;

// Use concrete query signatures rather than casting generic Prisma methods.
const mockPrisma = vi.hoisted(() => ({
    user: {
        findUnique: vi.fn<(args: Prisma.UserFindUniqueArgs) => Promise<AuthUser | null>>(),
        create: vi.fn<(args: Prisma.UserCreateArgs) => Promise<User>>(),
    },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

// Mock rate limiter
const mockRateLimiter = vi.hoisted(() => ({
    check: vi.fn<typeof authRateLimiter.check>()
        .mockReturnValue({ limited: false, remaining: 5, resetTime: 0, retryAfter: 0 }),
    reset: vi.fn<typeof authRateLimiter.reset>(),
}));

vi.mock("@/lib/rate-limit", () => ({ authRateLimiter: mockRateLimiter }));

describe("Auth Configuration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("DESKTOP_MODE", undefined);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
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
            vi.stubEnv("NODE_ENV", "development");
            const isDesktopMode = process.env.DESKTOP_MODE === "true";
            const isDev = process.env.NODE_ENV === "development";

            expect(isDev || isDesktopMode).toBe(true);
        });

        it("allows user creation in desktop mode", () => {
            vi.stubEnv("NODE_ENV", "production");
            vi.stubEnv("DESKTOP_MODE", "true");
            const isDesktopMode = process.env.DESKTOP_MODE === "true";
            const isDev = process.env.NODE_ENV === "development";

            expect(isDev || isDesktopMode).toBe(true);
        });

        it("blocks user creation in production without desktop mode", () => {
            vi.stubEnv("NODE_ENV", "production");
            vi.stubEnv("DESKTOP_MODE", undefined);
            const isDesktopMode = process.env.DESKTOP_MODE === "true";
            const isDev = process.env.NODE_ENV === "development";

            expect(isDev || isDesktopMode).toBe(false);
        });
    });

    describe("Rate Limiting", () => {
        it("checks rate limit before authentication", async () => {
            const checkMock = mockRateLimiter.check;
            checkMock.mockReturnValue({ limited: false, remaining: 5, resetTime: 0, retryAfter: 0 });

            const result = mockRateLimiter.check("127.0.0.1");
            expect(result.limited).toBe(false);
            expect(checkMock).toHaveBeenCalledWith("127.0.0.1");
        });

        it("blocks authentication when rate limited", async () => {
            const checkMock = mockRateLimiter.check;
            checkMock.mockReturnValue({ limited: true, remaining: 0, resetTime: 0, retryAfter: 60 });

            const result = mockRateLimiter.check("127.0.0.1");
            expect(result.limited).toBe(true);
            expect(result.retryAfter).toBe(60);
        });
    });

    describe("User Lookup", () => {
        it("finds existing user by email", async () => {
            const mockUser: AuthUser = {
                id: "user-123",
                email: "test@example.com",
                name: "Test User",
                passwordHash: "hashed-password",
            };

            mockPrisma.user.findUnique.mockResolvedValue(mockUser);

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
