import crypto from "crypto";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 600_000; // OWASP recommendation for PBKDF2-SHA256
const PBKDF2_SALT_LENGTH = 16;
const KEY_VERSION = 2; // Version 2 uses PBKDF2; Version 1 used SHA-256

/**
 * Derive encryption key using PBKDF2 with salt
 * This is more secure than simple SHA-256 as it's resistant to rainbow table attacks
 * and computationally expensive to brute force.
 * 
 * @param secret - The encryption secret from environment
 * @param salt - Random salt for key derivation (stored with ciphertext)
 * @returns 32-byte derived key
 */
function deriveKeyWithPBKDF2(secret: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
        secret,
        salt,
        PBKDF2_ITERATIONS,
        32, // 32 bytes = 256 bits for AES-256
        "sha256"
    );
}

/**
 * Derive encryption key using legacy SHA-256 (for backward compatibility)
 * @deprecated Use deriveKeyWithPBKDF2 for new encryptions
 */
function deriveKeyWithSHA256(secret: string): Buffer {
    return crypto.createHash("sha256").update(secret).digest();
}

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
    // For new encryptions, we'll use PBKDF2 with salt
    // This function is kept for backward compatibility but new code should use deriveKeyWithPBKDF2
    return deriveKeyWithSHA256(secret);
}

/**
 * Encrypts a plain-text API key using AES-256-GCM with PBKDF2 key derivation.
 * 
 * Format: `v2:salt:iv:ciphertext:authTag` (all hex strings)
 * - v2: Version marker for PBKDF2-derived keys
 * - salt: 16-byte random salt for PBKDF2
 * - iv: 16-byte random initialization vector
 * - ciphertext: Encrypted data
 * - authTag: 16-byte GCM authentication tag
 *
 * @param plainKey - UTF-8 key to encrypt; empty input is supported.
 * @returns Versioned encrypted format with salt for PBKDF2 derivation.
 * @throws If ENCRYPTION_SECRET_KEY is missing or shorter than 32 characters.
 */
export function encryptApiKey(plainKey: string): string {
    const secret = process.env.ENCRYPTION_SECRET_KEY;
    if (!secret) {
        throw new Error("Missing ENCRYPTION_SECRET_KEY environment variable");
    }
    if (secret.length < 32) {
        throw new Error(
            "ENCRYPTION_SECRET_KEY must be at least 32 characters. Generate one with: openssl rand -base64 32"
        );
    }

    // Generate random salt for PBKDF2
    const salt = crypto.randomBytes(PBKDF2_SALT_LENGTH);
    const key = deriveKeyWithPBKDF2(secret, salt);
    
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plainKey, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
        `v${KEY_VERSION}`,
        salt.toString("hex"),
        iv.toString("hex"),
        encrypted.toString("hex"),
        authTag.toString("hex"),
    ].join(":");
}

/**
 * Decrypts an AES-256-GCM encrypted API key.
 * Supports both v1 (SHA-256) and v2 (PBKDF2) formats for backward compatibility.
 *
 * v1 format: `iv:ciphertext:authTag` (legacy SHA-256 derivation)
 * v2 format: `v2:salt:iv:ciphertext:authTag` (PBKDF2 derivation)
 *
 * @param encryptedData - Encrypted data in either v1 or v2 format.
 * @returns Authenticated plaintext decoded as UTF-8.
 * @throws For malformed input, an invalid secret, or failed authentication.
 */
export function decryptApiKey(encryptedData: string): string {
    const secret = process.env.ENCRYPTION_SECRET_KEY;
    if (!secret) {
        throw new Error("Missing ENCRYPTION_SECRET_KEY environment variable");
    }
    if (secret.length < 32) {
        throw new Error(
            "ENCRYPTION_SECRET_KEY must be at least 32 characters. Generate one with: openssl rand -base64 32"
        );
    }

    const parts = encryptedData.split(":");
    
    // Detect version
    let key: Buffer;
    let ivHex: string;
    let encryptedHex: string;
    let authTagHex: string;

    if (parts[0] === "v2") {
        // Version 2: PBKDF2 with salt
        if (parts.length !== 5) {
            throw new Error("Invalid encrypted data format");
        }
        const [, saltHex, ivHexTemp, encryptedHexTemp, authTagHexTemp] = parts;
        ivHex = ivHexTemp;
        encryptedHex = encryptedHexTemp;
        authTagHex = authTagHexTemp;

        // Validate all hex fields first (before decoding)
        if (
            saltHex.length !== PBKDF2_SALT_LENGTH * 2 ||
            ivHex.length !== IV_LENGTH * 2 ||
            authTagHex.length !== AUTH_TAG_LENGTH * 2 ||
            [saltHex, ivHex, encryptedHex, authTagHex].some((part) => part.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(part))
        ) {
            throw new Error("Invalid encrypted data format");
        }

        const salt = Buffer.from(saltHex, "hex");
        if (salt.length !== PBKDF2_SALT_LENGTH) {
            throw new Error("Invalid salt length");
        }

        key = deriveKeyWithPBKDF2(secret, salt);
    } else {
        // Version 1: Legacy SHA-256 (backward compatibility)
        if (parts.length !== 3) {
            throw new Error("Invalid encrypted data format");
        }
        [ivHex, encryptedHex, authTagHex] = parts;
        key = deriveKeyWithSHA256(secret);
    }

    // Validate hex format
    if (
        ivHex.length !== IV_LENGTH * 2 ||
        authTagHex.length !== AUTH_TAG_LENGTH * 2 ||
        [ivHex, encryptedHex, authTagHex].some((part) => part.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(part))
    ) {
        throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

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

/**
 * Re-encrypts a v1 format ciphertext to v2 format with PBKDF2
 * This allows gradual migration of existing encrypted data
 * 
 * @param v1Encrypted - v1 format encrypted data (iv:ciphertext:authTag)
 * @returns v2 format encrypted data (v2:salt:iv:ciphertext:authTag)
 * @throws If the input is not valid v1 format or decryption fails
 */
export function migrateToPBKDF2(v1Encrypted: string): string {
    // Decrypt using v1 format
    const plaintext = decryptApiKey(v1Encrypted);
    
    // Re-encrypt using v2 format (PBKDF2)
    return encryptApiKey(plaintext);
}
