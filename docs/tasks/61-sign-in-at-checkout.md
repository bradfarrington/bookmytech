# Task 61: "Already have an account? Sign in" at checkout

**Status:** ✅ Complete (2026-09-16), walked in a browser through the real funnel on S28BSW. Raised by Brad from the Confirm screen.

## Why

**Brad, from the Confirm booking screen:** "shouldn't we have the ability to say, already a customer, log in, because at the minute it's just asking me to create passwords when I've already got an account with this email address."

He was right. The account block could only reach sign-in **reactively**:

- `accountMode` started at `"create"` and there was **no manual toggle**.
- It flipped to `"signin"` only after the customer pressed Continue and the server came back with `needsPassword`, which only happens when the email is taken *and* the password typed doesn't match.

So there were two working paths, and neither was signposted:

1. Type your **existing** password into the box labelled "Create a password (8+ characters)" and `ensureCustomerAccount` signs you straight in, links any guest bookings and carries on. Nothing on screen suggested this.
2. Type a **new** password, which is what the label instructs, and spend a failed submit to discover the block relabels itself to "You've booked with us before."

Nothing was broken and no account was ever damaged. But the copy told a returning customer the wrong thing, and finding out cost an attempt.

## The trap underneath it

A link alone would have been a dead end, because two server-side rules assumed the block was always a signup:

- **`accountFilled`** (the Continue gate) required `name.trim().length > 1` **and** `password.length >= MIN_PASSWORD_LENGTH`. In sign-in mode the name field is hidden, so someone who chose "Sign in" first would never satisfy it — **Continue disabled, with nothing to explain why.** It only worked on the reactive path because the customer had already typed a name before submitting.
- **`validateCustomerInput`** runs before the sign-in attempt and refuses an empty name with "Enter your name.", and a password under 8 characters. Both are signup rules. A returning customer picking "Already have an account?" would have been told to enter their name in order to sign in.

The minimum length matters on its own: it governs **choosing** a password, and an existing account may predate the rule. Imposing it on a sign-in would lock out exactly the customers this is for.

## Design

- **A visible switch** in the account block: "Already have an account? Sign in", and "Need an account? Create one" coming back. One `switchAccountMode` function so the two directions cannot drift.
- **The typed password is kept** when the customer switches by hand. Someone who typed their real password into the create field and then spotted the link should not have to type it again. The reactive flip still clears it, because there the server has just said that password was wrong.
- **The reactive flip no longer resets the mode.** A wrong password on a second attempt leaves them in sign-in rather than bouncing back to "create" and losing the way in.
- **`accountFilled` is per mode.** Sign-in needs an email and a non-empty password, nothing else.
- **`ensureCustomerAccount` takes an `intent`**, `"create" | "signin"`, defaulting to `"create"` so existing behaviour is untouched. `"signin"` skips `validateCustomerInput` entirely and goes straight to `signInWithPassword`, with its own wording on failure: "That email and password didn't match. Try again, or create an account."
- **The post-sign-in tidy-up is shared.** `adoptExistingCustomer` fills profile gaps without overwriting anything and links guest bookings on that email. Both routes into "signed in as an existing customer" use it, so the new path cannot forget to link a guest booking.
- **Copy:** the create-mode body now opens "New here?" instead of asserting "We'll create your account" before we know. Sign-in mode reads "Enter the password for your Book My Tech account", and the server's own message supplies the context on a reactive flip.

## Acceptance criteria

- [x] A visible way to say "already a customer" before submitting anything
- [x] A way back to creating an account
- [x] Sign-in mode hides the name and mobile fields and relabels the password
- [x] Continue is enabled in sign-in mode with only an email and password
- [x] The minimum-length rule is not applied to an existing password
- [x] "Enter your name." can no longer be returned to someone signing in
- [x] Guest bookings are still linked on the new path
- [x] A hand switch keeps the typed password; the reactive flip still clears it
- [x] A wrong password twice does not bounce back to "create"
- [x] 4 unit tests pinning the signup-vs-sign-in rule split (`lib/customers/signup-rules.test.ts`); suite 583 → 587
- [x] `tsc` clean, `next build` passes, no new lint problems
- [x] **Walked in a browser** through the real funnel on S28BSW to the same "Renew the air filter · £79.04" screen Brad reported: the link shows in create mode, switches, hides the right fields, offers the forgotten-password route, enables Continue with no name, and switches back keeping the password

## Mobile app — tell Brad

**Worth checking, probably the same gap.** The app has its own checkout and its own account block, and this was a website-only fix. If the app also only offers "create an account" at that step, it has the same problem for returning customers.

`POST /api/mobile/v1/checkout/prepare` and the booking endpoints are unchanged. `ensureCustomerAccount` is a website server action, not a mobile endpoint — the app signs in through Supabase directly — so there is no API change here, only a question about the app's own screen.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
