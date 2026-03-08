import crypto from "crypto";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
    const secret = process.env.ENCRYPTION_SECRET_KEY;
    if (!secret) {
        throw new Error("Missing ENCRYPTION_SECRET_KEY environment variable");
    }
    if (secret.length < 32) {
        throw new Error(
            "ENCRYPTION_SECRET_KEY must be at least 32 characters. Generate one with: openssl rand -base64 32"
        );
    }
    // Derive a 32‑byte key using SHA‑256
    return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plain‑text API key using AES‑256‑GCM.
 *
 * Return format: `iv:ciphertext:authTag` (all hex strings).
 */
export function encryptApiKey(plainKey: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plainKey, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
        iv.toString("hex"),
        encrypted.toString("hex"),
        authTag.toString("hex"),
    ].join(":");
}

/**
 * Decrypts an AES‑256‑GCM encrypted API key.
 *
 * Input must be the format produced by `encryptApiKey`.
 */
export function decryptApiKey(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
    }

    const [ivHex, encryptedHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);
    return decrypted.toString("utf8");
}

/**
 * Returns a short hint of the API key (last 4 characters prefixed with "...")
 * for UI display. Returns "****" if key is very short.
 */
export function getKeyHint(plainKey: string): string {
    if (plainKey.length <= 8) {
        return "****";
    }
    return "..." + plainKey.slice(-4);
}
