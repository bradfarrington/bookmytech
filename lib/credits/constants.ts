// Referral + loyalty constants (plain module — safe to import anywhere).

/** Referee gets this off their first booking when they sign up with a code. */
export const REFERRAL_WELCOME_PENCE = 1000; // £10

/** Referrer earns this once their referee completes their first booking. */
export const REFERRAL_BONUS_PENCE = 1000; // £10

/** Referral grants expire after this many days. */
export const CREDIT_EXPIRY_DAYS = 365;

/** Completed bookings needed to become a Trusted Customer (skip pre-auth). */
export const TRUSTED_THRESHOLD = 3;
