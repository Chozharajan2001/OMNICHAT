import { normalizedEmailSchema } from "@/lib/auth/email-policy";

export class EmailConfigurationError extends Error {
    constructor() {
        super("Email verification is unavailable");
        this.name = "EmailConfigurationError";
    }
}

function required(name: string): string {
    const value = process.env[name];
    if (!value?.trim() || /[\r\n]/.test(value)) throw new EmailConfigurationError();
    return value;
}

function isLoopback(host: string): boolean {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase());
}

function parseOrigin(value: string | undefined): URL {
    if (!value || !/^https?:\/\/[^/?#\\@\s]+\/?$/i.test(value)) throw new EmailConfigurationError();
    if ([...value].some((character) => character.charCodeAt(0) < 33)) throw new EmailConfigurationError();
    try { return new URL(value); }
    catch { throw new EmailConfigurationError(); }
}

export function getVerificationOrigin(): string {
    const url = parseOrigin(process.env.APP_ORIGIN ?? process.env.NEXTAUTH_URL);
    const localTest = process.env.NODE_ENV === "test" && isLoopback(url.hostname);
    if (url.protocol !== "https:" && !(localTest && url.protocol === "http:")) {
        throw new EmailConfigurationError();
    }
    return url.origin;
}

export function getEmailConfiguration() {
    const origin = getVerificationOrigin();
    const host = required("SMTP_HOST");
    const portText = required("SMTP_PORT");
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || port < 1 || port > 65535 || port === 465) {
        throw new EmailConfigurationError();
    }
    if (!/^[a-zA-Z0-9.:[\]-]+$/.test(host)) throw new EmailConfigurationError();
    const user = required("SMTP_USER");
    const pass = required("SMTP_PASSWORD");
    const from = required("SMTP_FROM");
    if (!normalizedEmailSchema.safeParse(from).success) throw new EmailConfigurationError();
    const insecureTest = process.env.NODE_ENV === "test"
        && process.env.SMTP_TEST_ALLOW_INSECURE === "true" && isLoopback(host);
    return { origin, host, port, user, pass, from, requireTLS: !insecureTest };
}
