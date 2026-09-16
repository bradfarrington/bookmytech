# Task 56: Deep links survive sign-in

**Status:** ✅ Complete (2026-09-16): `lib/safe-next.ts` plus its 11 unit tests, and `?next=` carried through `proxy.ts`, both customer auth doors, `signInUnified`, `signUp` and `/auth/callback`. Item 6 of Task 55. Exploration found **four** loss points, not the two the Task 55 notes recorded.

## Why

A signed-out customer opens a link from one of our emails, say `/dashboard/quotes/<id>`, and gets sent to `/login`. After signing in they land on the dashboard root and have to go and find the thing we just emailed them about.

The same fault broke the booking funnel, which is the worse case: `lib/bookings/checkout-context.ts` already redirects to `/login?next=<step>?quote=<id>`, so a customer whose session lapsed mid-checkout lost their quote and started again.

## Where it was lost

`?next=` was produced in four places and honoured in none.

| Loss point | What happened |
|---|---|
| `proxy.ts` `redirectKeepingCookies` | `url.search = ""`, and the helper took only a pathname, so the intended URL was never recorded. The `/dashboard` gate sent people to a bare `/login`. |
| `app/(customer)/login/page.tsx` | `searchParams` was typed `{ created?: string }`. `next` was never read and the form had no field for it. |
| `app/actions/sign-in.ts`, `app/actions/signup.ts` | Redirected from `DEST_FOR_ROLE` and ignored `next` entirely. |
| `app/auth/callback/route.ts` | `ALLOWED_NEXT` was an exact-match set of six static paths, so any link carrying an id or a query string silently collapsed to `/`. |

Because proxy gates `/dashboard/**` before a page runs, the three page-level `redirect('/login?next=…')` calls were unreachable in practice. Proxy had to learn about `next` first.

## Design

**One rule, in `lib/safe-next.ts`.** Every reader of `next` goes through it rather than keeping its own idea of what is safe. `safeNext` returns a relative `pathname[?search]` or null; callers supply their own fallback, so null means "use your default", not "fail".

Three checks, each catching what the others miss:

1. **Rooted, and no control characters or whitespace.** WHATWG URL parsing strips tab, newline and carriage return *before* parsing, so `/\t/evil.com` quietly becomes `//evil.com`.
2. **Resolve against a fixed base and require the origin back unchanged.** This is the check that actually stops the cross-origin cases, and it catches shapes a string test waves through: `//evil.com`, `https://evil.com` and `/\evil.com` all parse to a different host.
3. **No `..` segments, raw or decoded.** Both `/dashboard/../admin` and `/dashboard/%2e%2e/admin` normalise to `/admin`, so traversal is refused rather than followed to wherever it lands.

Then the path must sit under `/dashboard`, `/book`, `/mechanic` or `/admin`.

**`safeCustomerNext` narrows that to `/dashboard` and `/book`**, for the places where the role is known to be a customer. `/admin` and `/mechanic` are safe shapes but not a customer's destination: sending them there just bounces off that area's gate, so the link dies anyway and the person gets a pointless hop.

**Carried through:**

- `redirectKeepingCookies(request, response, target, next?)` — `target` may now carry its own query string. The request's own params are still blanked, because they belong to the page that was blocked, not to the login screen. `next` is the one exception and has been through `safeNext`.
- The `/dashboard` gate records where the person was heading.
- Proxy's already-signed-in bounce off `/login` and `/signup` honours `next` too, for a customer only. Without this a customer who *is* signed in never reaches the form, so the link still died.
- Both auth pages validate `next` and pass it as a hidden field; the cross-links between the two doors carry it, so switching from sign-in to sign-up keeps it.
- `signInUnified` honours it for the customer role only. `signUp` always makes a customer, so it honours it unconditionally, including on its `/login?created=1` retry path.
- `/auth/callback` uses `safeNext` in place of `ALLOWED_NEXT`.

## Acceptance criteria

- [x] `safeNext` rejects `//evil.com`, `https://evil.com`, `/\evil.com`, `%2f%2fevil.com`, control-character smuggling and `..` traversal, raw and encoded
- [x] 11 unit tests in `lib/safe-next.test.ts`; suite up from 548 to 559
- [x] Proxy carries the intended URL into `/login` instead of blanking it
- [x] Both auth doors read `next`, and the link between them keeps it
- [x] `signInUnified` and `signUp` honour it, customers only
- [x] `/auth/callback` keeps a path with an id or query string instead of collapsing it to `/`
- [x] `tsc` clean, `next build` passes, 559 tests pass
- [ ] Walked in a browser: signed out → `/dashboard/quotes/<id>` → sign in → land on the quote; and the lapsed-session checkout case. **Needs a signed-in customer and a real quote id.**

## Mobile app

No impact. Web-only: the app has no cookie session, no redirects and no `/login`.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
