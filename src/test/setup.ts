// Test setup file for Vitest
// This runs before all tests

// Set required environment variables for testing
process.env.ENCRYPTION_SECRET_KEY = "test-encryption-secret-key-32-chars!!";
process.env.AUTH_SECRET = "test-auth-secret-for-testing-only";
process.env.DATABASE_URL = "file:./test.db";

// Suppress console output during tests (optional - comment out to see logs)
// global.console = {
//     ...console,
//     log: vi.fn(),
//     debug: vi.fn(),
//     info: vi.fn(),
//     warn: vi.fn(),
//     error: vi.fn(),
// };
