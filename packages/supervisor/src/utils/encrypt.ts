import * as crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function createCipher(secretKey: Buffer) {
  return {
    encrypt(plaintext: string): string {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, secretKey, iv);
      let encrypted = cipher.update(plaintext, "utf8", "base64");
      encrypted += cipher.final("base64");
      const authTag = cipher.getAuthTag().toString("base64");
      return `${iv.toString("base64")}.${encrypted}.${authTag}`;
    },

    decrypt(ciphertext: string): string {
      try {
        const [ivBase64, encryptedBase64, authTagBase64] = ciphertext.split(".");
        if (!ivBase64 || !encryptedBase64 || !authTagBase64) {
          throw new Error("Invalid ciphertext format");
        }

        const iv = Buffer.from(ivBase64, "base64");
        const authTag = Buffer.from(authTagBase64, "base64");
        const decipher = crypto.createDecipheriv(ALGORITHM, secretKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      } catch {
        throw new Error("Failed to decrypt API key");
      }
    },
  };
}

export function getSecretKeyFromEnv(): Buffer {
  const keyFromEnv = process.env.SS_API_KEY_ENCRYPTION_KEY;
  if (keyFromEnv) {
    const keyBytes = Buffer.from(keyFromEnv, "hex");
    if (keyBytes.length === 32) {
      return keyBytes;
    }
  }

  const salt = process.env.SS_ENCRYPTION_SALT || "ss-default-salt";
  const keyMaterial = crypto.pbkdf2Sync(
    process.env.SS_MASTER_PASSWORD || "ss-default-password",
    salt,
    100000,
    32,
    "sha256",
  );
  return keyMaterial;
}

export function encryptApiKey(apiKey: string): string {
  const secretKey = getSecretKeyFromEnv();
  return createCipher(secretKey).encrypt(apiKey);
}

export function decryptApiKey(encryptedApiKey: string): string {
  const secretKey = getSecretKeyFromEnv();
  return createCipher(secretKey).decrypt(encryptedApiKey);
}
