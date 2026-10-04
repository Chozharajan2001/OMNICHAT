#!/usr/bin/env node
// scripts/users/add-user.mjs
//
// Operator bootstrap for the FIRST account on a host where sign-up is disabled.
// Production refuses auto-creation by design (canAutoCreateAccount() in
// src/lib/auth/email-policy.ts) and /api/auth/register answers 404 unless
// EMAIL_VERIFICATION_REQUIRED=true, so a fresh deployment otherwise has no way
// in. This is the documented escape hatch; it is an operator action, not an API.
//
// Usage:
//   pnpm users:add --email you@example.com                 # password read from stdin
//   pnpm users:add --email you@example.com --password-file ./pw.txt
//   pnpm users:add --email you@example.com --force         # reset an existing password
//   pnpm users:add --email you@example.com --verified      # stamp emailVerified (SMTP-less hosts)
//
// The password is deliberately NOT accepted as a command-line flag: argv lands in
// shell history and in the process table.

import { createInterface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";

const FLAGS = new Set(["--email", "--password-file", "--force", "--verified", "--help"]);

export function parseArgs(argv) {
    const options = { email: null, passwordFile: null, force: false, verified: false, help: false };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (!FLAGS.has(flag)) return { error: `Unknown argument: ${flag}` };
        if (flag === "--email") options.email = argv[++index] ?? null;
        else if (flag === "--password-file") options.passwordFile = argv[++index] ?? null;
        else if (flag === "--force") options.force = true;
        else if (flag === "--verified") options.verified = true;
        else options.help = true;
    }
    if (options.help) return { options };
    if (!options.email) return { error: "Missing --email" };
    return { options };
}

export function normalizeEmail(value) {
    const email = String(value ?? "").trim().toLowerCase();
    if (email.length === 0 || email.length > 254) return null;
    // Same shape as normalizedEmailSchema in src/lib/auth/email-policy.ts.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Mirrors validatePasswordComplexity(); bootstrap-cli.test.ts pins the two together. */
export function passwordRuleFailure(password) {
    if (typeof password !== "string" || password.length === 0) return "password is empty";
    if (password.length < 8) return "at least 8 characters";
    if (Buffer.byteLength(password, "utf8") > 72) return "at most 72 bytes (bcrypt limit)";
    if (!/[A-Z]/.test(password)) return "an uppercase letter";
    if (!/[a-z]/.test(password)) return "a lowercase letter";
    if (!/[0-9]/.test(password)) return "a digit";
    return null;
}

async function readPassword(passwordFile) {
    if (passwordFile) {
        const contents = await readFile(passwordFile, "utf8");
        return contents.replace(/\r?\n$/, "");
    }
    const stdin = process.stdin;
    if (!stdin.isTTY) {
        const piped = await new Promise((resolve) => {
            let data = "";
            stdin.setEncoding("utf8");
            stdin.on("data", (chunk) => { data += chunk; });
            stdin.on("end", () => resolve(data));
        });
        return piped.replace(/\r?\n$/, "");
    }
    const terminal = createInterface({ input: stdin, output: process.stderr, terminal: true });
    process.stderr.write("Password (input hidden): ");
    const muted = terminal.output;
    const write = muted.write.bind(muted);
    muted.write = () => true;
    try {
        return (await terminal.question("")).replace(/\r?\n$/, "");
    } finally {
        muted.write = write;
        terminal.close();
        process.stderr.write("\n");
    }
}

// Mirrors the adapter selection in src/lib/db/prisma.ts: scheme-based, because a
// PostgreSQL host may legitimately contain ".db" in its name.
async function connect(databaseUrl = process.env.DATABASE_URL ?? "file:./omnichat.db") {
    const { PrismaClient } = await import("@prisma/client");
    if (databaseUrl.startsWith("file:")) {
        const { PrismaLibSql } = await import("@prisma/adapter-libsql");
        return new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl }) });
    }
    const { PrismaPg } = await import("@prisma/adapter-pg");
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

const USAGE = `Usage: pnpm users:add --email <address> [--password-file <path>] [--force] [--verified]
Password comes from --password-file or stdin, never from a flag.`;

export async function main(argv = process.argv.slice(2)) {
    const parsed = parseArgs(argv);
    if (parsed.error) {
        console.error(`users:add: ${parsed.error}\n${USAGE}`);
        return 1;
    }
    if (parsed.options.help) {
        console.log(USAGE);
        return 0;
    }

    const email = normalizeEmail(parsed.options.email);
    if (!email) {
        console.error("users:add: --email is not a valid address (max 254 characters).");
        return 1;
    }

    const password = await readPassword(parsed.options.passwordFile);
    const failure = passwordRuleFailure(password);
    if (failure) {
        console.error(`users:add: rejected - the password needs ${failure}.`);
        return 1;
    }

    const prisma = await connect();
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing && !parsed.options.force) {
            console.error(`users:add: ${email} already exists. Re-run with --force to reset its password.`);
            return 2;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const name = email.split("@")[0];
        const emailVerified = parsed.options.verified ? new Date() : null;
        const user = existing
            ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, emailVerified } })
            : await prisma.user.create({ data: { email, name, passwordHash, emailVerified } });

        // Never echo the password or its hash.
        console.log(`users:add: ${existing ? "updated" : "created"} ${user.email} (id ${user.id})`);
        if (process.env.EMAIL_VERIFICATION_REQUIRED === "true" && !parsed.options.verified) {
            console.log("users:add: EMAIL_VERIFICATION_REQUIRED is on, so this account cannot sign in until verified. Re-run with --verified if this host has no SMTP.");
        }
        return 0;
    } catch (error) {
        console.error("users:add: failed -", error instanceof Error ? error.message : error);
        return 1;
    } finally {
        await prisma.$disconnect();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    process.exitCode = await main();
}
