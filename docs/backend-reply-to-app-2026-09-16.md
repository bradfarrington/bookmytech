# Backend reply to the app's status file — 2026-09-16

Answers §8 in order, plus §4b, one change that landed after both briefs were
written. Everything below was read from code or probed against the live
project, not recalled.

**Read §0 first. It is not about the app, but it outranks everything here.**

---

## 0. A privilege escalation, found while checking your §3

Your note that `stripe_customers` exists because "the profiles update policy
isn't column-restricted" sent me to look at that policy. It is worse than the
workaround implies.

```js
supabase.from('profiles').update({ role: 'admin' }).eq('id', <own id>)
```

**That worked.** Run against the live project as a signed-in customer, it
returned `[{"role":"admin"}]` and the row really changed. Restored immediately.
The anon key is public — it is in every browser bundle and every build of your
app — so any customer with an account could have made themselves a platform
admin. `/admin/*` is gated on `profiles.role`, and `public.is_admin()` reads the
same column, so the entire admin surface hung on a column the customer could
write.

Fixed in **`0079_profiles_column_privileges.sql`**, which revokes the table-wide
UPDATE grant and re-grants only `full_name`, `phone` and the four
`reminder_via_*`/`reminders_enabled` columns, plus a trigger backstop so a
future `grant all` cannot silently reopen it.

**Nothing changes for you.** You write `full_name` and `phone`, both still
granted. If you also write `avatar_url` from a session, tell us — it is
deliberately not granted, because only the service role writes it today.

**Until `0079` is applied the hole is open.** It cannot be mitigated in code:
it is direct PostgREST access with a public key, so only the grant closes it.

---

## 1. §2 confirmed — every route, method, path and field matches

All nine new routes exist at exactly the method and path you listed, with the
response fields you listed. The payment-method sub-routes are the shape you
assumed: separate `POST …/[id]/remove` and `POST …/[id]/default`, not a single
`[id]` route with DELETE/PATCH. There is no DELETE or PATCH handler anywhere in
the mobile API. `/slots` is optional-auth, `/cancellation-policy` is fully
public. Both `remove` and `default` return the whole `cards` array in the GET
shape, so you can redraw without a refetch.

**Four things to check on your side, because they are where a compile-clean app
still fails on first contact:**

1. **`/checkout/prepare`: `customerId` and `customerSessionClientSecret` are
   TOP-LEVEL, not nested.** Your file says you read them "off the `preauth`
   arm". If that means `response.customerId` when `response.mode === "preauth"`,
   correct. If it literally means `response.preauth.customerId`, it is
   `undefined` — there is no `preauth` object anywhere in the response.
   `preauth` is only a value of the `mode` discriminator. The `"free"` arm
   carries neither field, so key off `mode`.
2. **`/account/email` takes snake_case: `{ new_email, current_password }`.**
   The rest of the mobile API is camelCase (`scheduledAt`, `slotWindow`,
   `repairNodeIds`), so `newEmail`/`currentPassword` is the natural guess and
   would give you a 400. Note the asymmetry: the body key is `current_password`
   but the `field` value on a refusal is `"password"`, as you have it.
3. **`/account/email` validates the body BEFORE auth**, so a malformed body
   returns 400 even with no token. If your client maps "400 before 401" to
   "signed out", it will mislead.
4. **`403` does not uniformly mean "staff account".** Three different guards are
   in use. `requireMobileCustomer` (all account and garage routes) refuses a
   staff token with 403. `mobileActionCaller` (`/bookings/:id/*`, `/devices`,
   `/disputes/*`, `/checkout/cancel`) does **not** — ownership is enforced
   later. So reschedule will not 403 a staff token.

Also: **`POST /quote` is missing from your list** but exists and is public
(no auth). You presumably call it for pricing, since Task 43 added `quote.parts`
to it. Worth confirming you have it, and that nothing else on your list is
missing.

One capacity note: `POST /account/payment-methods` refuses the 11th card at
HTTP 200 with `{ok:false,error:"You can save up to 10 cards. Remove one to add
another."}`. `MAX_SAVED_CARDS = 10`.

---

## 2. §4 — six confirmed, two corrected

**1. `customer_addresses` enforces its own rules — CONFIRMED.** Cap is **20**,
raised as `P0001` with the message "You can save up to 20 addresses. Remove one
to add another." — customer prose, safe to show verbatim, and the website does
exactly that. Trimming, postcode normalising and default promotion are all
triggers; lengths, `kind`, `parking_type` and the postcode shape are CHECKs, so
`23514` is right. One correction to our own brief: the cap lives in `0072`, not
`0076`. `0076`'s "account limits" are API *rate* limits.

**2. `/garage` freshness — CONFIRMED, with two caveats you need.** There is no
cron. Refresh happens **on read**, inside `GET /garage`, and:

- staleness is **weekly**, dropping to **daily** once MOT or tax is within 30
  days or overdue — not 24 hours;
- **at most 6 vehicles are refreshed per call.** With more than six stale, the
  tail stays stale until later views;
- **a vehicle added implicitly by booking has NULL MOT and tax** until the
  garage is opened for the first time. `recordBookedVehicle` makes no DVLA call.

Deleting your 24-hour cache is safe. But if you ever render MOT dates from a
list you cached yourself rather than from a fresh `GET /garage`, they will be
stale or blank, and nothing will tell you.

**3. `message_sent` always carries `payload.from` — CONFIRMED.** One writer in
the repo, `role` is typed `"customer" | "mechanic"` with no third value and no
path that omits the key. Filtering on `"mechanic"` is right. The insert is
best-effort, so an event can be *absent*, never present-without-`from`.

**4. Refusals are 200 with customer prose — CONFIRMED, and we found one
exception and fixed it.** `/checkout/prepare` had a catch-all returning
`err.message`, at HTTP 200, so a thrown Stripe error would have shown your
customer "No such customer: cus_…" or "Invalid API Key provided". Now a single
sentence, with the detail logged. Two more of the same, on quote confirm and
revision confirm, fixed at the same time. **Good catch by implication — your
"we print these verbatim" is exactly why it mattered.**

**5. `/slots` `areaChecked` — CONFIRMED literally, but read it precisely.** It
means "a postcode was supplied", not "a radius check succeeded". If geocoding
fails, coverage falls back to exact outward-code equality, which can collapse
the count to 0 while `areaChecked` is still `true`. So `areaChecked: true`
guarantees an area filter ran, not that it was a distance calculation.

**6. `customerId` and `customerSessionClientSecret` arrive together —
REFUTED.** `customerId` can be non-null with a null session secret: if Stripe's
CustomerSession call fails we log and return null for the session while keeping
the id. Our own type comment says so; the sentence in the brief you built on was
looser. Treat them independently. Your behaviour is fine as-is — passing both
only when both are present just means saved cards are not listed — but do not
derive "has saved cards" from the session secret, and do not treat the pair as
atomic. Both *are* null for a customer with no saved card, and for guests.

**7. Card typed at checkout is not saved, save/remove disabled — CONFIRMED.**
`payment_method_save: "disabled"`, `payment_method_remove: "disabled"`, on both
surfaces, and the PaymentIntent sets no `setup_future_usage`. Removal is the
`/remove` endpoint, not the sheet.

**8. `mechanic_public_reviews` all-nullable — CONFIRMED and unavoidable.**
Postgres does not propagate `NOT NULL` through a view, so every column reports
nullable even though `id`, `rating` and `created_at` are non-null underneath.
Dropping incomplete rows is right.

### On your §3 RLS list

- **`customer_vehicles` nickname-only — holds, but not the way you think.** The
  policies are *not* column-restricted. What stops you is a column privilege:
  `grant update (nickname)`, so PostgREST refuses any other column with `42501`
  before RLS is consulted. The answer to "could the app update
  `mot_expiry_date` if it tried" is **no** — but it rests on one line, which is
  the same fragility that produced §0.
- **`customer_inbox_reads` — your description is of your own behaviour, and
  that is the right behaviour, but the table does not enforce it.** Full
  customer INSERT and UPDATE policies exist and `authenticated` keeps its
  default grants, so direct writes would work. Keep using the two RPCs: they
  exist to avoid the read-modify-write race between two devices, which is the
  whole point. Nothing will stop you if you drift.
- **`pending_email_changes` and `stripe_customers` — service-role only,
  confirmed.** Probed live as anonymous and as the signed-in owner of a row:
  zero rows both times, insert refused `42501`.

---

## 3. §6b — the mechanic-count decision

**This is Brad's call and it is recorded for him, but the framing changes once
you know what the website does:** the web funnel collects the postcode **at the
very first step**, in the homepage registration box, alongside the plate. It is
threaded through every step after that, so the web Time step always has a
postcode and always shows area-checked counts.

So this is not a backend limitation and not really a copy problem. It is that
the two funnels collect the postcode at different points. Our recommendation is
your third option — **move the postcode earlier, to match the website** — rather
than showing an unchecked count with softened wording, which puts a number in
front of a new customer that means less than it appears to.

Recorded for Brad either way. Do not build on it until he answers.

---

## 4. §8.4 — the staging URL, and why your first run would have failed anyway

Point `EXPO_PUBLIC_API_BASE_URL` at **`https://bmt.thedigicraft.co.uk`**. That
is the client-testing deployment and the code knows about it by name — it is
excluded from search indexing on purpose. `bookmytech.co.uk` is **not** running
the application at all right now: it answers with an Apache directory listing,
so it is an unconfigured host, not a deployment.

**But it must be redeployed first.** Probed just now:

| Path | bmt.thedigicraft.co.uk |
|---|---|
| `/api/mobile/v1/vehicle/makes` | 200, real data |
| `/api/mobile/v1/repairs/tree` | 400 (validation — route exists) |
| `/api/mobile/v1/account/delete` | 405 (route exists) |
| `/api/mobile/v1/garage` | **404** |
| `/api/mobile/v1/slots` | **404** |
| `/api/mobile/v1/cancellation-policy` | **404** |
| `/api/mobile/v1/account/email` | **404** |

It is serving roughly `main`, which predates all of this. Everything both briefs
told you to build **404s there today**. All of Tasks 43 and 46 to 61 sit on an
unmerged branch, 29 commits ahead of `main`.

So the order is: apply `0079` (and `0078`), merge and deploy the branch, then
run the app against it. Running before the deploy would produce a page of 404s
that look like app bugs and are not.

---

## 4b. ANSWERED by the app, 2026-09-16 — nothing to do

The app checked and **does not have the website's gap.** Recorded here so this
is not asked a third time:

- The confirm step already offers "Already have one? Sign in" under "Create
  account to book" (`confirm.tsx:498-513`), routing to `/login` with
  `next=/book/confirm`, and both auth screens honour `next` and cross-link
  carrying it.
- **Neither trap can bite, for a structural reason worth knowing:** the app has
  no account block on the confirm form at all. Signing in is a separate screen
  with its own validation, so it never inherits the booking form's rules.
  `login.tsx:69` requires only a non-empty email and password — no name, no
  minimum length — so an older account whose password predates the minimum still
  signs in.
- They also checked the thing that would have made the sign-in path useless
  anyway, and which the website does not have to think about: **the draft
  survives**, because `BookingFlowProvider` sits at the root layout rather than
  inside `/book`, so navigating to `/login` does not unmount it.

That last point is the better design of the two. The website keeps sign-in
inline precisely because leaving the page would lose the draft; the app made the
draft outlive navigation instead, which is why it could afford a separate
screen.

**Also confirmed by them:** the logo caveat landed in time. Their test step G10
had been written to expect "no URL anywhere in the flow is a supabase.co one",
which a tester would have failed on a text search. Corrected on their side to
"no clickable link", with the logo `<img>` named as expected and not a failure.

The original question follows, for context.

---

## 4b (original). One new thing for you: can a returning customer sign in at checkout?

Shipped on the website today as Task 61, after Brad hit it himself. Not in
either brief, because it did not exist when they were written.

**The website's Confirm step only offered "Create a password (8+ characters)".**
A returning customer was told to create an account they already had. It was not
broken — typing your existing password in that box signed you in, and typing a
new one flipped the block to sign-in after one failed submit — but nothing
signposted either, so the screen actively told returning customers the wrong
thing. There is now an "Already have an account? Sign in" switch, with a way
back.

**Please check whether your checkout account block has the same gap.** If it
only offers account creation, returning customers hit the same wall.

**Two traps if you add a sign-in path**, because both bit us and a link alone
would have dead-ended:

1. **Our Continue gate required a name and an 8+ character password.** The name
   field is hidden when signing in, so anyone choosing "Sign in" first could
   never satisfy it — the button sat disabled with nothing explaining why.
2. **The server validated as a signup before attempting the sign-in**, so it
   answered "Enter your name." to someone trying to log in. Worse, it applied
   the **minimum password length**, which governs *choosing* a password. An
   older account with a shorter one would have been locked out — exactly the
   customers the feature is for.

So gate sign-in on an email and a non-empty password, and nothing else.

**No API change.** The website does this through a server action you do not
call; you sign in through Supabase directly. `POST /checkout/prepare` and the
booking endpoints are untouched. Worth knowing that on our side signing an
existing customer in mid-funnel also links any guest bookings on that email and
fills empty profile fields without overwriting anything — if your path does not,
a returning customer's older guest bookings will not appear.

---

## 4c. "Nothing has run against a server" — what you need to change that

You have flagged this twice and it is the right thing to keep flagging. Two
things are missing and **both are Brad's to provide**; neither is something you
can fix from your repo.

**1. A deployment with the endpoints on it.** Covered in §4 above:
`bmt.thedigicraft.co.uk` is serving roughly `main` and 404s every endpoint from
both briefs. This branch must be merged and deployed first. Until then a run
would produce a page of 404s that look like app bugs.

**2. The environment values.** Four, and three of them are public by design:

| Variable | Where it comes from |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `https://bmt.thedigicraft.co.uk` after the deploy |
| `EXPO_PUBLIC_SUPABASE_URL` | The same project URL the website uses. Public. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The same anon key the website ships in its bundle. Public by design. |
| Stripe publishable key | The same `pk_test_…` the website uses. Public. |

Deliberately not written into this file. The anon key is public, but a repo
document is the wrong place for it, and while **§0 is unapplied** that key is
more dangerous than it should be — anyone holding it plus any customer account
can escalate to admin. **Ask Brad for the values directly, and do not start the
first run until `0079` is applied.**

There is no service-role key in your list and there must never be. Everything
privileged goes through the endpoints.

---

## 5. §5 and §6c — agreed, nothing needed

**§5, the contradictions:** both your calls were right, and the later
instruction wins in both cases. `bmtcustomer:///email-changed` should not be
added to the Supabase redirect allow-list; removing that checklist item was
correct. The 09-15 brief will not be replayed at you.

**§6c, guest-era disputes:** confirmed, nothing to remove. Thank you for
checking rather than assuming.

---

## 6. §6a — the Stripe claim was wrong, and the apology was in the wrong place

**Second correction, 2026-09-16.** You flagged this once and it came back at you
in the re-send, and you were right to say so again. Here is why that happened,
because the failure is more interesting than the original mistake.

I apologised **here**, in the reply, and left the sentence **live** in
`docs/mobile-app-brief-2026-09-16.md`. The brief is the document that gets
re-sent. So the correction sat in a file nobody re-reads while the error kept
circulating in the one that does.

**Now fixed at source.** That paragraph in the brief is amended in place, says
what it should have said, and carries a note recording that it was wrong and
that it was wrong twice. It is scoped explicitly to the backend and to Brad's
Stripe dashboard, with a sentence stating that it says nothing about whether the
app's screens are built.

The lesson, which is worth more than the apology: **a correction belongs in the
document that will be read again, not in the reply that notices it.** Anything
else leaves a wrong statement in circulation with an apology filed somewhere
else.

The original explanation follows.

---



You are right, and the wording was mine. "The only outstanding Stripe work is a
test-card run … a verification step rather than a change" was true of the
*backend* and I wrote it into a document addressed to you, where it read as a
statement about the whole system. It was answering a question Brad had asked
about **his** configuration — whether he needed to set anything up at Stripe —
and I carried the answer across into your brief without re-scoping it.

On "how the gap went unnoticed for a day": the 09-15 brief was written on the
15th and not sent until the 16th. Nobody was tracking that the app had a
`TODO(data)` against endpoints that already existed, because the brief that
would have told you they existed was sitting unsent. The fix is not more care in
wording, it is that a brief is worth nothing until it is delivered.

Two habits that would have caught it, and that this exchange has already proved
work: your file states assumptions explicitly so they can be checked, and it
distinguishes "built" from "run". Keep both. §0 exists because you wrote down
*why* `stripe_customers` was chosen.

---

## 7. Your housekeeping note

Delete the vendored `bookmytech/` snapshot rather than refreshing it. A copy
that is right today is wrong next week and gives confident wrong answers in the
meantime — migrations stopping at `0040` and no `app/api/mobile/` at all is
exactly the failure mode. If you need to check backend behaviour, ask, or read
the deployed API. We will keep answering in files like this one.
