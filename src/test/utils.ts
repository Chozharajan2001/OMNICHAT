// Test utilities for mocking authentication and other common patterns

import { vi } from "vitest";

/**
 * Mock a successful authentication session
 */
export function mockAuthSession(userId: string = "test-user-id") {
    return {
        user: {
            id: userId,
            email: "test@example.com",
            name: "Test User",
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
}

/**
 * Mock no authentication session (unauthenticated)
 */
export function mockNoAuthSession() {
    return null;
}

/**
 * Helper to create a mock Request object
 */
export function createMockRequest(
    url: string = "http://localhost:3000/api/test",
    options: RequestInit = {}
): Request {
    return new Request(url, options);
}

/**
 * Helper to create a mock JSON request
 */
export function createJsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request("http://localhost:3000/api/test", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

/**
 * Mock the getServerSession function
 */
export function mockGetServerSession(session: ReturnType<typeof mockAuthSession> | null) {
    return vi.fn().mockResolvedValue(session);
}

/**
 * Mock the requireAuth function
 */
export function mockRequireAuth(shouldThrow: boolean = false) {
    if (shouldThrow) {
        return vi.fn().mockRejectedValue(new Error("Unauthorized"));
    }
    return vi.fn().mockResolvedValue(mockAuthSession());
}

/**
 * Reset all mocks after each test
 */
export function resetAllMocks() {
    vi.clearAllMocks();
    vi.resetAllMocks();
}
