// The strength bar under "New password" (Task 48). Guidance only: it never
// blocks a password. The one enforced rule is the signup minimum
// (MIN_PASSWORD_LENGTH in lib/customers/provision.ts), checked on the server.

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  /** 0 when empty; 1 to 4 fills that many segments of the bar. */
  score: StrengthScore;
  /** The line under the bar. */
  hint: string;
}

// A short list of the passwords people pick most, at or over eight characters.
const COMMON = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "87654321",
  "qwertyui",
  "qwertyuiop",
  "qwerty123",
  "iloveyou",
  "iloveyou1",
  "letmein1",
  "welcome1",
  "abc12345",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "superman",
  "trustno1",
  "admin123",
  "bookmytech",
]);

const HINTS: Record<Exclude<StrengthScore, 0>, string> = {
  1: "Weak. Add more characters, numbers or symbols.",
  2: "Fair. A few more characters would help.",
  3: "Good.",
  4: "Looking strong.",
};

/** "abcdefgh", "12345678", "87654321": every character one step from the last. */
function isRun(value: string): boolean {
  if (value.length < 3) return false;
  const step = value.charCodeAt(1) - value.charCodeAt(0);
  if (step !== 1 && step !== -1) return false;
  for (let i = 2; i < value.length; i++) {
    if (value.charCodeAt(i) - value.charCodeAt(i - 1) !== step) return false;
  }
  return true;
}

export function passwordStrength(password: string, minLength = 8): PasswordStrength {
  if (password.length < minLength) {
    return { score: password ? 1 : 0, hint: `Use at least ${minLength} characters.` };
  }

  const lower = password.toLowerCase();
  // A common password, one pattern repeated ("abcabcabc", "aaaaaaaa"), or a run.
  if (COMMON.has(lower) || /^(.+?)\1+$/.test(password) || isRun(lower)) {
    return { score: 1, hint: "That one's too easy to guess." };
  }

  let variety = 0;
  if (/[a-z]/.test(password)) variety += 1;
  if (/[A-Z]/.test(password)) variety += 1;
  if (/\d/.test(password)) variety += 1;
  if (/[^A-Za-z0-9]/.test(password)) variety += 1;

  const length = password.length;
  let score = 1;
  if (variety >= 2) score += 1;
  if (length >= 12 || variety >= 3) score += 1;
  // A long passphrase is strong even in plain words.
  if ((length >= 12 && variety >= 3) || length >= 20) score += 1;

  const capped = Math.min(score, 4) as Exclude<StrengthScore, 0>;
  return { score: capped, hint: HINTS[capped] };
}
