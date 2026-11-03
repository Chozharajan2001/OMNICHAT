import { z } from "zod";

export function isEmailVerificationRequired(): boolean {
    // Strict true takes precedence over development and offline desktop mode.
    return process.env.EMAIL_VERIFICATION_REQUIRED === "true";
}

export function canAutoCreateAccount(): boolean {
    if (isEmailVerificationRequired()) return false;
    return process.env.NODE_ENV === "development" || process.env.DESKTOP_MODE === "true";
}

export const normalizedEmailSchema = z.string().trim().toLowerCase().max(254).email();

export function validatePasswordComplexity(password: string): boolean {
    return password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72
        && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}

export const registrationSchema = z.object({
    email: normalizedEmailSchema,
    password: z.string().refine(validatePasswordComplexity),
}).strict();

export const resendSchema = z.object({ email: normalizedEmailSchema }).strict();
export const verificationSchema = z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
