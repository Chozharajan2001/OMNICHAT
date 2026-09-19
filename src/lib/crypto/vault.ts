import crypto from "crypto";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

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
 * @param plainKey - UTF-8 key to encrypt; empty input is supported.
 * @returns `iv:ciphertext:authTag` as hex, with a random 16-byte IV and 16-byte tag.
 * @throws If ENCRYPTION_SECRET_KEY is missing or shorter than 32 characters.
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
 * @param encryptedData - Three colon-separated, even-length hexadecimal fields
 * produced by `encryptApiKey`; uppercase hex is also accepted.
 * @returns Authenticated plaintext decoded as UTF-8.
 * @throws For malformed input, an invalid secret, or failed authentication.
 */
export function decryptApiKey(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
    }

    const [ivHex, encryptedHex, authTagHex] = parts;
    // Buffer.from(..., "hex") silently truncates invalid or odd-length input.
    // Validate before decoding; an empty ciphertext represents empty plaintext.
    if (
        ivHex.length !== IV_LENGTH * 2 ||
        authTagHex.length !== AUTH_TAG_LENGTH * 2 ||
        parts.some((part) => part.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(part))
    ) {
        throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);
    return decrypted.toString("utf8");
}

/**
 * Returns a short hint of the API key (last 4 characters prefixed with "...")
 * for UI display.
 * @param plainKey - Key whose hint will be displayed; never log the full value.
 * @returns "****" for keys of at most 8 UTF-16 code units, otherwise the last 4
 * code units prefixed with "...".
 */
export function getKeyHint(plainKey: string): string {
    if (plainKey.length <= 8) {
        return "****";
    }
    return "..." + plainKey.slice(-4);
}
