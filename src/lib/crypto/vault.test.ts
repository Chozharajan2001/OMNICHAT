import { afterEach, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, getKeyHint } from "./vault";

const ORIGINAL_SECRET = process.env.ENCRYPTION_SECRET_KEY;

afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
        delete process.env.ENCRYPTION_SECRET_KEY;
    } else {
        process.env.ENCRYPTION_SECRET_KEY = ORIGINAL_SECRET;
    }
});

describe("vault encryption helpers", () => {
    it("encrypts and decrypts API keys", () => {
        process.env.ENCRYPTION_SECRET_KEY = "0123456789abcdef0123456789abcdef";
        const plain = "sk-test-super-secret-key";

        const encrypted = encryptApiKey(plain);
        const decrypted = decryptApiKey(encrypted);

        expect(encrypted).not.toBe(plain);
        expect(decrypted).toBe(plain);
    });

    it("throws if ENCRYPTION_SECRET_KEY is missing", () => {
        delete process.env.ENCRYPTION_SECRET_KEY;

        expect(() => encryptApiKey("sk-test")).toThrow(
            "Missing ENCRYPTION_SECRET_KEY environment variable"
        );
    });

    it("throws if ENCRYPTION_SECRET_KEY is too short", () => {
        process.env.ENCRYPTION_SECRET_KEY = "short";

        expect(() => encryptApiKey("sk-test")).toThrow(
            "ENCRYPTION_SECRET_KEY must be at least 32 characters. Generate one with: openssl rand -base64 32"
        );
    });

    it("returns formatted key hints", () => {
        expect(getKeyHint("sk-1234567890")).toBe("...7890");
        expect(getKeyHint("short")).toBe("****");
    });
});
