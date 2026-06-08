-- The Twilio sending number is platform-owned and resold centrally for profit,
-- so it must never be tenant/admin-configurable. It now lives purely in backend
-- config (the TWILIO_FROM env var, read in lib/sms/send-sms.ts). Drop the
-- admin-editable column so the panel can't override the platform number.
alter table public.sms_settings
  drop column if exists sms_from_number;
