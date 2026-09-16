# Task 60: Messages get noticed

**Status:** ✅ Built (2026-09-16): a `message_sent` audit event, messages in the customer's Inbox and header dot, a Messages screen and nav badge on the mechanic console. Item 2 of Task 55. **No migration** — `message_sent` is already in the `booking_events` CHECK constraint (`0064`).

## Why, and what "chat" turned out to mean

Brad's note on Task 55 was "chat needs building on the website, the customer app, the mechanic console, and the mechanic app once it exists". That had three readings, so it was put to him.

**Brad's decision (2026-09-16): better customer-to-mechanic messaging, not live support chat.** So no conversation or message tables, no admin support inbox, no phone line, and the help centre's hidden Chat and Phone cards stay hidden.

Booking messages already existed on both web surfaces. The problem was that **nothing made a message noticeable**:

- The customer's Inbox and its header unread dot are built from `booking_events`, and `lib/inbox/events.ts` is a deliberate allow-list with no message entry. A message never appeared as news.
- **Nothing wrote a `message_sent` event at all.** The admin live activity feed already had a branch rendering that type, so it was dead code, and the plan's "just add it to the allow-list" would have added a label for an event that never existed.
- The mechanic console had **no Messages nav item and no unread count**. A thread was reachable only by opening its job, so a customer's question sat unseen unless the mechanic happened to open that booking. The 5-minute SMS fallback sweep was the only thing that made a message noticeable.

## Design

**Not Realtime.** The Task 55 notes suggested it, but `useStayFresh` polling is this project's standing pattern and `messages` is deliberately outside the Realtime publication (`0049`). This is about surfaces and counts, not transport.

**`sendMessageFor` now writes a `booking_events` row** per message, `payload: { from: role }`.

- Written for **both directions**, because the audit trail and the admin live feed want both.
- `from` is what lets the customer's Inbox show only the mechanic's messages, so a customer isn't notified about their own words. That branch is in `describeEvent`, not in the query, because the feed's allow-list filter cannot see direction.
- **The message body is not copied into the event.** `messages` already holds it, and duplicating customer words into an append-only table would put the same text in a second place with different deletion rules.
- Best-effort: the message is already sent, so a failed audit row must not report failure to whoever sent it.

**Customer side:** `message_sent` added to `EVENT_LABELS` as "New message from your mechanic", with its own icon, and its Inbox item opens the **thread** rather than the booking summary — the point of tapping it is to read and reply.

**Mechanic side:** `/mechanic/messages` lists threads on **open jobs only**, since `sendMessageFor` refuses to post to a completed or cancelled booking and listing a closed thread in an inbox implies a reply that isn't possible. Ordering is unread first, then most recent: needing an answer beats being recent. Nine unread is not treated as more urgent than one, so a long-ignored thread can't be pushed down by a busier newer one. Read through the mechanic's own client, so RLS scopes it and the page needs no ownership filter.

**The nav badge** reuses the existing `MechanicNavBadges` mechanism, keyed by href, alongside the disputes count. `countUnreadMechanicMessages` uses `head: true` and returns 0 on any failure: a broken count must not take out the shell every mechanic page renders inside.

**`markMessagesReadFor` now revalidates**, but only when a row actually changed. It is called on every poll tick, so revalidating unconditionally would throw away the shell's cache eight times a minute. Without it the badge kept showing a count for messages the mechanic had just read — the worst possible moment for a stale number.

**`CLOSED_STATUSES` moved to `lib/messages/constants.ts`** so testable code can read it without importing the `"server-only"` sender. `send.ts` re-exports it, so existing imports still work.

**The mechanic app still does not exist**, and `app/api/mobile/v1/` is customer-only. Nothing to build there; recorded so the question doesn't come round again.

## Verified against the live database

- The three new queries run: open bookings, the bulk message read, and the embedded-filter unread count.
- **`message_sent` passes the `booking_events` CHECK constraint**, proven without writing anything: a bogus event type is rejected with `23514` (check violation) while `message_sent` gets through to a `23503` (foreign key violation) on a non-existent booking. So the constraint is live and the type is allowed — no migration needed.

## Acceptance criteria

- [x] A mechanic's message appears in the customer's Inbox and lights the header dot
- [x] A customer's own message does **not** come back at them as a notification
- [x] The Inbox item opens the thread, not the booking summary
- [x] The admin live feed's `message_sent` branch is no longer dead code
- [x] The mechanic console has a Messages screen listing threads on open jobs
- [x] Unread threads sort first, then by recency
- [x] A nav badge counts unread customer messages, and clears when the thread is read
- [x] Polling does not churn the cache: revalidation only when a row changed
- [x] No Realtime; polling kept
- [x] 11 new tests (6 on ordering, 5 on the inbox wording and links); suite 570 → 581
- [x] `tsc` clean, `next build` passes, no new lint problems, live queries verified
- [x] `/mechanic/messages` renders signed in at 375px and desktop, with its empty state, and **Messages** is in the console nav
- [ ] The round trip: send a mechanic message, see it in the customer's Inbox and header dot, read it, watch the badge clear. Needs a booking shared by the test mechanic and customer.

## Mobile app — tell Brad

**One thing to mirror, additive.** The app builds its Inbox from the same `booking_events` allow-list in its own `src/lib/booking-events.ts`. A `message_sent` item will now arrive and **the app will drop it** unless that file gains matching wording:

- label: "New message from your mechanic"
- **only when `payload.from === 'mechanic'`** — otherwise a customer sees their own messages as notifications
- tapping it should open the booking's message thread

No endpoint or shape changed. The app has no `GET` messages endpoint and reads `messages` directly under RLS, which is unaffected. Push on a mechanic's message already worked and is untouched.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
