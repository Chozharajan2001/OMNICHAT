import { describe, expect, it } from "vitest";
import { saveKeySchema } from "./schemas";

// The route maps a ZodError to a 400 with details, so the whitelist itself is
// what decides whether an unknown provider can ever reach the vault.

const KEY = "sk-real-looking-secret-value-1234";

describe("saveKeySchema providerId whitelist (3.5)", () => {
    it("accepts a provider the registry knows", () => {
        const parsed = saveKeySchema.safeParse({ providerId: "openai", apiKey: KEY });

        expect(parsed.success).toBe(true);
    });

    it("refuses a provider that is not in the registry", () => {
        const parsed = saveKeySchema.safeParse({ providerId: "totally-made-up", apiKey: KEY });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;
        expect(parsed.error.issues.map((issue) => issue.path.join("."))).toContain("providerId");
    });

    // A key saved against an unknown id is encrypted and counted but never
    // rendered, because the providers list only walks the registry.
    it("names the rejected provider in the issue", () => {
        const parsed = saveKeySchema.safeParse({ providerId: "not-a-provider", apiKey: KEY });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;
        expect(parsed.error.issues[0]?.message).toContain("not-a-provider");
    });

    it("keeps the existing shape rules", () => {
        expect(saveKeySchema.safeParse({ providerId: "openai", apiKey: "short" }).success).toBe(false);
        expect(saveKeySchema.safeParse({ providerId: "openai" }).success).toBe(false);
    });
});
