import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), close: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: mail.create } }));
import { EmailConfigurationError, getEmailConfiguration, getVerificationOrigin } from "./config";
import { EmailDeliveryError, sendVerificationEmail } from "./smtp";

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://chat.example.com");
    vi.stubEnv("SMTP_HOST", "smtp-relay.brevo.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "smtp-user");
    vi.stubEnv("SMTP_PASSWORD", "smtp-secret");
    vi.stubEnv("SMTP_FROM", "no-reply@example.com");
    vi.stubEnv("SMTP_TEST_ALLOW_INSECURE", undefined);
    mail.create.mockReturnValue({ sendMail: mail.send, close: mail.close });
    mail.send.mockResolvedValue({ accepted: ["test@example.com"], rejected: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("strict SMTP configuration", () => {
    it("has no import-time transport or network activity", () => {
        expect(mail.create).not.toHaveBeenCalled();
        getEmailConfiguration();
        expect(mail.create).not.toHaveBeenCalled();
    });

    it.each(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"])("rejects missing %s", (key) => {
        vi.stubEnv(key, "");
        expect(getEmailConfiguration).toThrow(EmailConfigurationError);
    });

    it.each(["0", "65536", "587x", "465", "5.5"])("rejects invalid or non-STARTTLS port %s", (port) => {
        vi.stubEnv("SMTP_PORT", port);
        expect(getEmailConfiguration).toThrow(EmailConfigurationError);
    });

    it.each([
        "http://chat.example.com", "https://user:pass@chat.example.com", "https://chat.example.com/path",
        "https://chat.example.com?redirect=evil", "https://chat.example.com#token", "bad-url", "",
        "https:///chat.example.com", "https://chat.example.com/path/..", "https://chat.example.com\\evil", "https://chat.\nexample.com",
    ])("rejects unsafe canonical origin %s", (origin) => {
        vi.stubEnv("APP_ORIGIN", origin);
        expect(getVerificationOrigin).toThrow(EmailConfigurationError);
    });

    it("uses NEXTAUTH_URL only when APP_ORIGIN is absent", () => {
        vi.stubEnv("APP_ORIGIN", undefined);
        vi.stubEnv("NEXTAUTH_URL", "https://fallback.example.com/");
        expect(getVerificationOrigin()).toBe("https://fallback.example.com");
        vi.stubEnv("APP_ORIGIN", "invalid");
        expect(getVerificationOrigin).toThrow(EmailConfigurationError);
    });

    it.each(["bad@", "a@example.com\r\nBcc: victim@example.com"])("rejects invalid sender %s", (sender) => {
        vi.stubEnv("SMTP_FROM", sender);
        expect(getEmailConfiguration).toThrow(EmailConfigurationError);
    });

    it("allows plaintext only for explicitly opted-in loopback tests", () => {
        vi.stubEnv("SMTP_TEST_ALLOW_INSECURE", "true");
        vi.stubEnv("SMTP_HOST", "127.0.0.1");
        expect(getEmailConfiguration().requireTLS).toBe(true);
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
        expect(getEmailConfiguration().requireTLS).toBe(false);
        vi.stubEnv("SMTP_HOST", "smtp-relay.brevo.com");
        expect(getEmailConfiguration().requireTLS).toBe(true);
    });
});

describe("SMTP delivery", () => {
    it("requires validated STARTTLS and sends a fragment-only canonical confirmation link", async () => {
        const token = "a".repeat(64);
        await sendVerificationEmail("test@example.com", token);
        expect(mail.create).toHaveBeenCalledWith(expect.objectContaining({
            requireTLS: true, secure: false, ignoreTLS: false,
            tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
            connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
            logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
        }));
        expect(mail.send.mock.calls[0][0].text).toContain(`https://chat.example.com/verify-email#token=${token}`);
        expect(mail.send.mock.calls[0][0].text).not.toContain("?token=");
        expect(mail.close).toHaveBeenCalledOnce();
    });

    it("redacts provider errors and closes transport after failure", async () => {
        mail.send.mockRejectedValue(new Error("smtp-secret recipient token internal-host"));
        await expect(sendVerificationEmail("test@example.com", "a".repeat(64)))
            .rejects.toEqual(new EmailDeliveryError());
        expect(mail.close).toHaveBeenCalledOnce();
    });

    it("treats SMTP recipient rejection as unavailable", async () => {
        mail.send.mockResolvedValue({ accepted: [], rejected: ["test@example.com"] });
        await expect(sendVerificationEmail("test@example.com", "a".repeat(64))).rejects.toThrow(EmailDeliveryError);
    });
});
