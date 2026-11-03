import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
import {
    chatRequestSchema,
    createConversationSchema,
    preferencesSchema,
    saveKeySchema,
    updateConversationSchema,
} from "@/lib/validators/schemas";

// public/openapi.json used to describe a different application: seven of
// fifteen routes, and four response shapes the handlers no longer emit. This
// test binds the document to the code so the spec cannot silently drift again.

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const API_DIR = fileURLToPath(new URL("../app/api/", import.meta.url));
const SPEC_FILE = fileURLToPath(new URL("../../public/openapi.json", import.meta.url));

interface Spec {
    servers: { url: string }[];
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
}

function spec(): Spec {
    return JSON.parse(readFileSync(SPEC_FILE, "utf8")) as Spec;
}

// Next.js segment -> OpenAPI template: [id] becomes {id}, [...nextauth]
// becomes {authRoute} (the catch-all is not a literal path in the spec).
function toSpecSegment(name: string): string {
    const catchAll = /^\[\.\.\.(.+)\]$/.exec(name);
    if (catchAll) return `{${catchAll[1]}Route}`;
    const single = /^\[(.+)\]$/.exec(name);
    return single ? `{${single[1]}}` : name;
}

function toRouteSegment(name: string): string {
    const catchAll = /^\{(\w+)Route\}$/.exec(name);
    if (catchAll) return `[...${catchAll[1]}]`;
    const single = /^\{(\w+)\}$/.exec(name);
    return single ? `[${single[1]}]` : name;
}

function servedPaths(dir: string, prefix = ""): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
            if (entry.name === "route.ts") found.push(prefix);
            continue;
        }
        servedPaths(`${dir}/${entry.name}`, `${prefix}/${toSpecSegment(entry.name)}`).forEach((p) => found.push(p));
    }
    return found;
}

function routeFileFor(path: string): string {
    const dir = path.split("/").filter(Boolean).map(toRouteSegment).join("/");
    return `${API_DIR}${dir}/route.ts`;
}

function exportedMethods(file: string): string[] {
    const source = readFileSync(file, "utf8");
    // Three export styles are in use: `export async function POST(...)`,
    // `export const POST = createEmailRoute(...)` (the email routes), and
    // `export const { GET, POST } = handlers` (the Auth.js catch-all).
    const patterns = {
        declaration: (method: string) => new RegExp(`^export\\s+(?:async\\s+)?function\\s+${method}\\b`, "m"),
        binding: (method: string) => new RegExp(`^export\\s+const\\s+${method}\\b`, "m"),
        destructured: (method: string) => new RegExp(`^export\\s+const\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`, "m"),
    };
    return HTTP_METHODS.filter((method) =>
        Object.values(patterns).some((pattern) => pattern(method).test(source))
    );
}

function fieldNames(schema: ZodTypeAny): string[] {
    const shape = (schema as { shape?: Record<string, unknown> }).shape;
    if (!shape) throw new Error("Expected an object schema with a shape");
    return Object.keys(shape).sort();
}

function schemaProperties(name: string): string[] {
    const entry = spec().components.schemas[name];
    expect(entry, `spec schema ${name} is missing`).toBeTruthy();
    return Object.keys(entry?.properties ?? {}).sort();
}

const served = servedPaths(API_DIR).sort();

describe("OpenAPI surface matches the route handlers", () => {
    it("is served under the /api base", () => {
        expect(spec().servers.every((server) => server.url.endsWith("/api"))).toBe(true);
    });

    it("documents every routed path and nothing that is not routed", () => {
        expect(Object.keys(spec().paths).sort()).toEqual(served);
    });

    it.each(served)("documents the real HTTP methods of %s", (path) => {
        const operations = Object.keys(spec().paths[path] ?? {}).map((m) => m.toUpperCase());
        expect(operations.sort()).toEqual(exportedMethods(routeFileFor(path)).sort());
    });

    it("documents chat, metrics, health and the email routes", () => {
        for (const path of ["/chat", "/metrics", "/health", "/auth/register", "/auth/verify-email"]) {
            expect(spec().paths, `missing ${path}`).toHaveProperty(path);
        }
    });
});

describe("OpenAPI request schemas match the Zod validators", () => {
    it.each([
        ["ChatRequest", chatRequestSchema],
        ["CreateConversationRequest", createConversationSchema],
        ["UpdateConversationRequest", updateConversationSchema],
        ["PreferencesUpdate", preferencesSchema],
        ["SaveKeyRequest", saveKeySchema],
    ] as const)("binds %s to its schema", (name, schema) => {
        expect(schemaProperties(name)).toEqual(fieldNames(schema));
    });

    it("keeps the retired isPinned flag out of the update contract", () => {
        expect(schemaProperties("UpdateConversationRequest")).not.toContain("isPinned");
        expect(fieldNames(updateConversationSchema)).not.toContain("isPinned");
    });
});

describe("OpenAPI response shapes match what the handlers emit", () => {
    it("lists key metadata under `keys` and never key material", () => {
        expect(schemaProperties("ApiKey")).toEqual([
            "createdAt", "id", "isValid", "keyHint", "lastValidatedAt", "providerId",
        ]);
    });

    it("serves the projects list flat, the way both consumers read it", () => {
        // The handler used to wrap this one collection in `{ data: {...} }` while
        // the sidebar and settings/projects both destructured `{ projects }`, so
        // every project list rendered empty and nothing failed loudly.
        const response = spec().paths["/projects"]?.get as {
            responses: { "200": { content: { "application/json": { schema: { properties?: Record<string, unknown> } } } } };
        };
        expect(Object.keys(response.responses["200"].content["application/json"].schema.properties ?? {})).toEqual(["projects"]);

        const source = readFileSync(routeFileFor("/projects"), "utf8");
        expect(source).toContain("NextResponse.json({ projects })");
        expect(source).not.toContain("{ data: {");

        expect(JSON.stringify(spec().paths["/preferences"]?.get)).not.toContain("data");
    });

    it("documents the degraded readiness tier and the fail-closed metrics 404", () => {
        const health = JSON.stringify(spec().components.schemas.HealthStatus);
        expect(health).toContain("degraded");
        expect(health).toContain("unhealthy");
        expect(spec().paths["/metrics"]?.get).toHaveProperty("security");
        expect(JSON.stringify(spec().paths["/metrics"]?.get)).toContain("404");
    });
});
