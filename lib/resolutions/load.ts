import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolutionStatus } from "./constants";
import { formatJobNumber } from "@/lib/utils";

// One-to-one embeds arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

// Shared loaders for the Resolution Center. They take whichever Supabase client
// the caller holds (RLS-aware server client for the mechanic, service-role admin
// client for the admin console) — the query shape is identical either way; the
// client decides what rows come back.

type Queryable = SupabaseClient;

export interface CaseListRow {
  id: string;
  status: ResolutionStatus;
  reasonLabel: string;
  shortRef: string;
  mechanicId: string;
  createdAt: string;
  redistributed: boolean;
}

interface RawCase {
  id: string;
  booking_id: string;
  mechanic_id: string;
  status: ResolutionStatus;
  reason_label: string;
  redistributed: boolean;
  created_at: string;
  booking: { job_number: number | null } | { job_number: number | null }[] | null;
}

export async function listCases(client: Queryable): Promise<CaseListRow[]> {
  const { data } = await client
    .from("resolution_cases")
    .select(
      "id, booking_id, mechanic_id, status, reason_label, redistributed, created_at, booking:bookings(job_number)",
    )
    .order("created_at", { ascending: false });
  return ((data as RawCase[] | null) ?? []).map((c) => ({
    id: c.id,
    status: c.status,
    reasonLabel: c.reason_label,
    shortRef: formatJobNumber(one(c.booking)?.job_number),
    mechanicId: c.mechanic_id,
    createdAt: c.created_at,
    redistributed: c.redistributed,
  }));
}

export interface CaseDetail {
  id: string;
  bookingId: string;
  shortRef: string;
  mechanicId: string;
  status: ResolutionStatus;
  reasonLabel: string;
  description: string;
  redistributed: boolean;
  resolutionNote: string | null;
  createdAt: string;
  openedByRole: "mechanic" | "admin";
}

export async function loadCase(client: Queryable, id: string): Promise<CaseDetail | null> {
  const { data } = await client
    .from("resolution_cases")
    .select(
      "id, booking_id, mechanic_id, status, reason_label, description, redistributed, resolution_note, created_at, opened_by_role, booking:bookings(job_number)",
    )
    .eq("id", id)
    .maybeSingle();
  const c = data as
    | (RawCase & {
        description: string;
        resolution_note: string | null;
        opened_by_role: "mechanic" | "admin";
      })
    | null;
  if (!c) return null;
  return {
    id: c.id,
    bookingId: c.booking_id,
    shortRef: formatJobNumber(one(c.booking)?.job_number),
    mechanicId: c.mechanic_id,
    status: c.status,
    reasonLabel: c.reason_label,
    description: c.description,
    redistributed: c.redistributed,
    resolutionNote: c.resolution_note,
    createdAt: c.created_at,
    openedByRole: c.opened_by_role,
  };
}

export interface RawMessage {
  id: string;
  sender_role: "mechanic" | "admin";
  body: string;
  created_at: string;
}

export async function loadMessages(client: Queryable, caseId: string) {
  const { data } = await client
    .from("resolution_messages")
    .select("id, sender_role, body, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  return ((data as RawMessage[] | null) ?? []).map((m) => ({
    id: m.id,
    senderRole: m.sender_role,
    body: m.body,
    createdAt: m.created_at,
  }));
}
