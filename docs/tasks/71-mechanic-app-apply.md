# Task 71: The mechanic app — applying to join

**Status:** 🟡 **Built 2026-09-18, not yet run end to end.** Typecheck, lint on every touched file, 671 unit tests and a production build pass; both routes register. The guards were smoke-tested against a local production server (no header → 400, not multipart → 415, not JSON → 415, another draft's `docs` path → 400). **No real application has been submitted through the new route** — that writes a row and emails the ops inbox, so it's left for a deliberate test. No migration. Paths, field names and shapes are as the prompt gave them, with the deviations below.

Source: `bmt-mechanic-app/docs/apply-crm-prompt.md`. Eighth mechanic-app prompt.

"Apply to be a mechanic" inside the app is the web wizard at `/mechanics/apply`
done natively: the same four steps, fields and rules, the same row in
`mechanic_applications`, the same emails. Review, approval and the
set-password invite are unchanged.

## One core, two clients

`app/actions/submit-application.ts` had two anonymous service-role actions,
neither rate limited, and a server that took whatever the browser sent. Both
moved into a shared core, and the actions are now wrappers:

- `lib/applications/validate.ts` — every rule, pure, 17 unit tests.
- `lib/applications/submit.ts` — `uploadApplicationDocFor` (same bucket, path,
  10 MB cap, pdf/jpeg/png/webp, `upsert: true`) and `submitApplicationFor` (same
  insert, same bank-field encryption, same `application_received` and
  `admin_new_application` emails).

## Routes — under `app/api/mobile/v1/`, no session

| Route | Guard | 200 |
|---|---|---|
| `POST applications/documents` (multipart: `draftId`, `docType`, `file`) | `X-BMT-Client: mechanic-app` (400 without) + IP limit | `{ path }` |
| `POST applications` (JSON) | `readJsonBody` + IP limit | 201 `{ applicationId }` |

Refusals are non-2xx `{ error }`: 400 for a rule, 409 for a duplicate email,
429 past a limit, 500 for storage or the insert (a sentence, never the raw
error). Shared guards: `lib/mobile/application-guards.ts`.

**Why the header.** The upload is anonymous and multipart, so it has neither
usual guard. A custom header isn't CORS-simple, so a browser must preflight it
and no route answers one — the same protection `application/json` gives the
JSON routes. It isn't authentication; the IP limits hold for non-browsers.

**Limits** (code defaults in `lib/rate-limit/limiter.ts`; tunable later by
adding `platform_settings` rows, no migration needed). Fail closed.

| Key | Value |
|---|---|
| `mobile_applydoc_ip_burst` | 10 / minute |
| `mobile_applydoc_ip_daily` | 40 / day |
| `mobile_applydoc_global_daily` | 600 / day (~100 applicants) |
| `mobile_apply_ip_hourly` | 5 / hour |
| `mobile_apply_ip_daily` | 10 / day |
| `mobile_apply_global_daily` | 100 / day |

## What the server now refuses (it used to take it)

- a missing business type, name or number;
- no specialisms, or one that isn't a slug from `lib/specialisms.ts`;
- `yearsExperience` that isn't null or a whole number 0–70;
- **a `docs` path that isn't exactly `applications/<draftId>/<docType>.<ext>`**
  — another draft, another type, another folder or a climb out with `..`.
  Before this, a crafted submit could point an application at someone else's
  passport;
- a `vat` document when `vatRegistered` is false;
- a missing or malformed `draftId` (the documents can't be checked without it).

## Deviations

- **The wizard's review page now sends only the documents it lists.** A VAT
  file uploaded before the applicant unticked "VAT registered" used to be sent
  anyway; the new rule would have refused them on the last page.
- **The duplicate 409** now reads: "An application with that email already
  exists. If you've been rejected before or need to update it, email
  support@bookmytech.co.uk." — on the website too.
- **Set-password no longer redirects at once.** It redirected the moment the
  password saved, so an added line would never be seen. It now shows "Your
  password is set. Now sign in on the BMT Mechanic app with this email and
  password." with an "Or continue on the website" button.
- **Storage errors** reach the applicant as a sentence on the website too.
- **The website's two actions are still not rate limited**, as before. Next's
  Origin check stops a cross-site browser; a script can still call them. Not
  in the prompt's scope.

## Answers

- **A rejected applicant can never reapply with the same email.** `email` is
  `UNIQUE`, rejection only changes `status`, nothing deletes an application,
  and the resubmit link exists only for `needs_info`. Hence the 409 wording.
- **An address that's already a mechanic's is NOT refused at submit.** Submit
  is anonymous, so a specific refusal would tell anyone whether an email is a
  BMT mechanic. Approval already stops it (`ensureMechanicAccount`: "already a
  mechanic"), and customers and admins applying under their own address are
  allowed on purpose (owner decision 2026-07-20).

## Acceptance criteria

- [ ] With no session, the app uploads each document type to a draft and submits an application that lands in the approvals queue with its documents, and both emails go.
- [x] A multipart upload without `X-BMT-Client` is refused (smoke-tested: 400).
- [ ] Both routes refuse past their IP limits.
- [x] A submit whose `docs` path belongs to another draft is refused (unit-tested and smoke-tested: 400).
- [ ] The web wizard behaves as before, and now also refuses what the new server checks refuse.
- [ ] After approval, set-password shows the app line.
- [x] Typecheck, lint, unit tests and a production build pass; both routes register.

## When complete

1. Set the status line above.
2. Update `docs/HANDOFF.md` — "Current task".
3. Commit.
