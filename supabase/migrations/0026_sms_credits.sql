-- ============================================================================
-- Task 13 Stage B — SMS credits system
-- Ported from the sms-credits skill. The skill assumes a `business_profile`
-- singleton + Deno edge functions; Book My Tech has neither, so SMS state lives
-- in a dedicated `sms_settings` singleton (a typed integer balance we can
-- decrement atomically) and all logic runs in Next.js route handlers / actions.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ── sms_settings: the singleton SMS config + balance ────────────────────────
-- One row, pinned to id = 1 (the check + default guarantee a single row).
create table if not exists public.sms_settings (
  id                      integer primary key default 1 check (id = 1),
  sms_enabled             boolean not null default false,
  sms_credits_balance     integer not null default 0 check (sms_credits_balance >= 0),
  sms_sender_name         text,            -- 1-11 char alphanumeric sender id
  sms_from_number         text,            -- a real Twilio number (trial accounts require it)
  sms_low_credit_notified boolean not null default false,
  low_credit_alert_email  text,            -- recipient of the low-credit alert; editable in the panel
  updated_at              timestamptz not null default now()
);

insert into public.sms_settings (id) values (1) on conflict (id) do nothing;

-- ── sms_credit_purchases: top-up ledger ─────────────────────────────────────
create table if not exists public.sms_credit_purchases (
  id                    uuid primary key default gen_random_uuid(),
  credits_purchased     integer not null,
  amount_paid_pence     integer not null,
  gocardless_payment_id text,                              -- GoCardless payment id (PMxxxx)
  status                text not null default 'completed', -- 'completed' | 'pending' | 'failed'
  created_at            timestamptz not null default now()
);

-- Idempotency: the webhook inserts one row per confirmed payment. A partial
-- unique index makes a racing second delivery fail cleanly, never double-credit.
create unique index if not exists sms_credit_purchases_gc_payment_id_key
  on public.sms_credit_purchases (gocardless_payment_id)
  where gocardless_payment_id is not null;

-- ── sms_log: send ledger ────────────────────────────────────────────────────
create table if not exists public.sms_log (
  id              uuid primary key default gen_random_uuid(),
  recipient_phone text not null,
  message_body    text,
  twilio_sid      text,                     -- null on failure
  status          text not null,            -- 'sent' | 'failed'
  credits_used    integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists sms_log_created_at_idx on public.sms_log (created_at desc);

-- ── Atomic credit reserve / refund ──────────────────────────────────────────
-- The sender reserves a credit BEFORE hitting Twilio (the atomic UPDATE is the
-- concurrency gate so two simultaneous sends can never share one credit), then
-- refunds if Twilio rejects. Plain read-then-write would oversend under the
-- concurrent cron + message-fallback senders.
create or replace function public.reserve_sms_credit()
  returns integer
  language sql
  security definer
  set search_path = public
as $$
  update public.sms_settings
     set sms_credits_balance = sms_credits_balance - 1
   where id = 1 and sms_enabled = true and sms_credits_balance > 0
  returning sms_credits_balance;
$$;

create or replace function public.refund_sms_credit()
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.sms_settings
     set sms_credits_balance = sms_credits_balance + 1
   where id = 1;
$$;

-- Only the service role (the server-only sender) may move credits.
revoke execute on function public.reserve_sms_credit() from anon, authenticated;
revoke execute on function public.refund_sms_credit() from anon, authenticated;

-- ── messages: sweep double-send guard ───────────────────────────────────────
-- Stamped whenever an SMS nudge has gone out for a message, so the immediate
-- mechanic→customer fallback and the 5-minute unread sweep never both text.
alter table public.messages add column if not exists sms_notified_at timestamptz;

-- ── RLS: deny by default ─────────────────────────────────────────────────────
-- These tables are read/written only server-side via the service-role client
-- (createAdminClient), which bypasses RLS. Enable RLS with no anon/authenticated
-- policies so a leaked anon key can't reach balance, purchase history, or logs.
alter table public.sms_settings          enable row level security;
alter table public.sms_credit_purchases  enable row level security;
alter table public.sms_log               enable row level security;
