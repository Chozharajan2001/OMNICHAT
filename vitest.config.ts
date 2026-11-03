import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        globals: true,
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/lib/**/*.ts", "src/app/api/**/*.ts", "src/components/**/*.tsx", "src/hooks/**/*.ts"],
            exclude: ["**/*.test.ts", "**/*.test.tsx", "**/node_modules/**", "**/dist/**"],
        },
        // Projects: separate node and jsdom environments
        projects: [
            {
                test: {
                    name: "node",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["src/**/*.test.tsx"],
                },
                resolve: {
                    alias: { "@": path.resolve(__dirname, "./src") },
                },
            },
            {
                test: {
                    name: "ui",
                    environment: "jsdom",
                    include: ["src/**/*.test.tsx"],
                },
                resolve: {
                    alias: { "@": path.resolve(__dirname, "./src") },
                },
            },
        ],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
