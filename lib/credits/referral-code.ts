// Referral-code generation. Plain module (no I/O) so it's importable anywhere
// and unit-testable. Codes look like "BMT4F9K2Q" — a fixed prefix + unambiguous
// base32 (no 0/O/1/I/L) so they're easy to read aloud and type.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 30 chars, no look-alikes

/**
 * Generate a referral code from N random bytes. `randomByte` is injected so the
 * function stays pure/testable; callers pass crypto.getRandomValues-backed bytes.
 */
export function referralCodeFromBytes(bytes: Uint8Array, length = 6): string {
  let body = "";
  for (let i = 0; i < length; i++) {
    body += ALPHABET[bytes[i % bytes.length] % ALPHABET.length];
  }
  return `BMT${body}`;
}

/** Random referral code using the Web Crypto API (available in Node 18+/edge). */
export function generateReferralCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return referralCodeFromBytes(bytes, length);
}

/** Normalise user-entered codes (strip spaces, uppercase) before lookup. */
export function normaliseReferralCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
