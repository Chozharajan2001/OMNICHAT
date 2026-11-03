import nodemailer from "nodemailer";
import { getEmailConfiguration } from "./config";

export class EmailDeliveryError extends Error {
    constructor() {
        super("Email verification is unavailable");
        this.name = "EmailDeliveryError";
    }
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
    const config = getEmailConfiguration();
    const link = new URL("/verify-email", config.origin);
    // Fragments do not reach server access logs or the Referer header.
    link.hash = new URLSearchParams({ token, email }).toString();
    const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: false,
        requireTLS: config.requireTLS,
        ignoreTLS: !config.requireTLS,
        auth: { user: config.user, pass: config.pass },
        tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
    });
    try {
        const result = await transport.sendMail({
            from: config.from,
            to: email,
            subject: "Confirm your OmniChat email",
            text: [
                "An OmniChat email verification was requested for this address.",
                "Only continue if you created this account and requested verification.",
                "If verification is still needed, open this link and press Confirm email:",
                link.toString(),
                "The link expires in 30 minutes and only works for a pending account.",
                "If you already verified your account, sign in instead.",
                "If you did not request this, ignore this email. No action is required.",
            ].join("\n\n"),
        });
        if (!result.accepted?.length || result.rejected?.length) throw new EmailDeliveryError();
    } catch {
        // Never propagate SMTP responses, addresses, tokens or credentials.
        throw new EmailDeliveryError();
    } finally {
        transport.close();
    }
}
