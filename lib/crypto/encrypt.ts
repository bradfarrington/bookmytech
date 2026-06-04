import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

// Application-level AES-256-GCM encryption for sensitive fields that must never
// be stored as plain text — currently mechanic applicants' bank sort code and
// account number (Task 07 Stage 1).
//
// Key comes from the APP_ENCRYPTION_KEY env var (server-only, never NEXT_PUBLIC).
// Any 32-byte value works; we hash whatever is supplied with SHA-256 so the env
// var can be a human-typed passphrase or a base64/hex blob and still yield a
// valid 256-bit key. Rotate by re-encrypting existing rows under a new key.
//
// Ciphertext format (single base64 string): iv(12) || authTag(16) || ciphertext.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set — required to encrypt sensitive fields.",
    );
  }
  // Normalise any input length to a 32-byte key.
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypt a UTF-8 string. Returns a self-contained base64 blob (iv|tag|ct). */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Reverse of `encrypt`. Throws if the blob is malformed or the tag fails. */
export function decrypt(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Ciphertext is too short to be valid.");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Mask a decrypted account number / sort code for display in the admin UI —
 * we rarely need the full value on screen, only the last few digits to
 * cross-check. Keeps the last `visible` characters, masks the rest.
 */
export function maskTail(value: string, visible = 4): string {
  const digits = value.replace(/\s+/g, "");
  if (digits.length <= visible) return digits;
  return "•".repeat(digits.length - visible) + digits.slice(-visible);
}
