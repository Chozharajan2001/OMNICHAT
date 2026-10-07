import { describe, expect, it } from "vitest";
import { preferencesSchema, saveKeySchema } from "./schemas";

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

describe("preferencesSchema defaults against the registry (3.6)", () => {
    // PATCH is partial: a theme-only update carries no provider at all, and
    // refusing that would lock the settings page out of saving anything.
    it("accepts an update that names no provider", () => {
        expect(preferencesSchema.safeParse({ theme: "dark" }).success).toBe(true);
        expect(preferencesSchema.safeParse({}).success).toBe(true);
    });

    it("accepts a provider and model the registry pairs together", () => {
        expect(preferencesSchema.safeParse({
            defaultProviderId: "anthropic",
            defaultModelId: "claude-sonnet-4",
        }).success).toBe(true);
    });

    it("refuses an unknown provider before it can become everyone's default", () => {
        const parsed = preferencesSchema.safeParse({ defaultProviderId: "not-a-provider" });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;
        expect(parsed.error.issues.map((issue) => issue.path.join("."))).toContain("defaultProviderId");
    });

    // The pair matters: a model that exists under another provider would save
    // cleanly and then fail at the first turn.
    it("refuses a model that is not the chosen provider's", () => {
        const parsed = preferencesSchema.safeParse({
            defaultProviderId: "openai",
            defaultModelId: "claude-sonnet-4",
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;
        expect(parsed.error.issues.map((issue) => issue.path.join("."))).toContain("defaultModelId");
    });

    it("checks a model only alongside the provider it was sent with", () => {
        expect(preferencesSchema.safeParse({ defaultModelId: "gpt-4o" }).success).toBe(true);
    });
});
