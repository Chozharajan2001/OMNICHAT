import { createCipheriv, createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptApiKey, encryptApiKey, getKeyHint } from "./vault";

const TEST_SECRET = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
    vi.stubEnv("ENCRYPTION_SECRET_KEY", TEST_SECRET);
});

afterEach(() => {
    vi.unstubAllEnvs();
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

    it.each(["", " ", "key\u0000with\ncontrols", "clé-日本語", "x".repeat(4096)])(
        "round-trips arbitrary UTF-8 input (case %#)", (plain) => {
            expect(decryptApiKey(encryptApiKey(plain))).toBe(plain);
        }
    );

    it("generates distinct IVs and ciphertext for repeated plaintext", () => {
        const first = encryptApiKey("same-key");
        const second = encryptApiKey("same-key");
        expect(first.split(":")[0]).not.toBe(second.split(":")[0]);
        expect(first).not.toBe(second);
        expect(decryptApiKey(first)).toBe("same-key");
        expect(decryptApiKey(second)).toBe("same-key");
    });

    it("preserves the existing 16-byte IV/tag hexadecimal wire format", () => {
        expect(encryptApiKey("key")).toMatch(/^[a-f0-9]{32}:[a-f0-9]{6}:[a-f0-9]{32}$/);
    });

    it("decrypts an independently constructed legacy-format ciphertext", () => {
        const iv = Buffer.alloc(16, 7);
        const key = createHash("sha256").update(TEST_SECRET).digest();
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        const encrypted = Buffer.concat([cipher.update("legacy-key", "utf8"), cipher.final()]);
        const fixture = [iv, encrypted, cipher.getAuthTag()].map((part) => part.toString("hex")).join(":");
        expect(decryptApiKey(fixture)).toBe("legacy-key");
        expect(decryptApiKey(fixture.toUpperCase())).toBe("legacy-key");
    });

    it.each([0, 1, 2])("rejects a modified envelope segment %i", (index) => {
        const parts = encryptApiKey("tamper-target").split(":");
        parts[index] = (parts[index][0] === "0" ? "1" : "0") + parts[index].slice(1);
        expect(() => decryptApiKey(parts.join(":"))).toThrow();
    });

    it("rejects decryption under a different secret", () => {
        const encrypted = encryptApiKey("stored-key");
        vi.stubEnv("ENCRYPTION_SECRET_KEY", "different-secret".repeat(3));
        expect(() => decryptApiKey(encrypted)).toThrow();
    });

    it.each([undefined, "", "x".repeat(31)])("rejects missing or short secrets during decryption (case %#)", (secret) => {
        const encrypted = encryptApiKey("stored-key");
        vi.stubEnv("ENCRYPTION_SECRET_KEY", secret);
        expect(() => decryptApiKey(encrypted)).toThrow(/ENCRYPTION_SECRET_KEY/);
    });

    it.each(["", "no-separators", "aa:bb", "aa:bb:cc:dd", "::"])(
        "rejects malformed envelopes: %j", (input) => {
            expect(() => decryptApiKey(input)).toThrow("Invalid encrypted data format");
        }
    );

    it.each([0, 1, 2])("rejects non-hex suffixes in segment %i without silently truncating", (index) => {
        const parts = encryptApiKey("stored-key").split(":");
        parts[index] += "zz";
        expect(() => decryptApiKey(parts.join(":"))).toThrow("Invalid encrypted data format");
    });

    it.each([0, 1, 2])("rejects an odd-length segment %i without silently truncating", (index) => {
        const parts = encryptApiKey("stored-key").split(":");
        parts[index] += "a";
        expect(() => decryptApiKey(parts.join(":"))).toThrow("Invalid encrypted data format");
    });

    it.each([0, 1, 2])("rejects whitespace embedded in segment %i", (index) => {
        const parts = encryptApiKey("stored-key").split(":");
        parts[index] = parts[index].slice(0, 2) + " " + parts[index].slice(2);
        expect(() => decryptApiKey(parts.join(":"))).toThrow("Invalid encrypted data format");
    });

    it.each([0, 2])("requires a full-length IV/tag in segment %i", (index) => {
        const parts = encryptApiKey("stored-key").split(":");
        parts[index] = parts[index].slice(0, 8);
        expect(() => decryptApiKey(parts.join(":"))).toThrow("Invalid encrypted data format");
    });

    it("rejects valid hex ciphertext with a removed byte", () => {
        const parts = encryptApiKey("stored-key").split(":");
        parts[1] = parts[1].slice(2);
        expect(() => decryptApiKey(parts.join(":"))).toThrow();
    });

    it.each([
        ["", "****"], ["1234567", "****"], ["12345678", "****"],
        ["123456789", "...6789"], ["abcdef1234", "...1234"],
    ])("masks key-hint boundaries for %j", (plain, hint) => {
        expect(getKeyHint(plain)).toBe(hint);
    });
});
