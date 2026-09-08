"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHECKLIST_TIERS, type ChecklistTier } from "@/lib/checklists/checklists";

// The admin's checklist editor (Task 32): rename items and sections, add
// items, reorder, set the Bronze / Silver / Gold tiers an inspection item
// applies to, and switch items off (soft — old reports keep their items).
// Every write goes through the service-role client after an admin check.

export type ChecklistActionResult = { ok: true } | { ok: false; error: string };

const MAX_LABEL = 160;

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only." };
  return { ok: true };
}

function cleanLabel(raw: string, what: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: `Give the ${what} a name.` };
  if (value.length > MAX_LABEL) return { ok: false, error: `Keep the ${what} under ${MAX_LABEL} characters.` };
  return { ok: true, value };
}

function cleanTiers(raw: readonly string[] | null | undefined): ChecklistTier[] | null {
  if (raw == null) return null;
  const tiers = CHECKLIST_TIERS.filter((t) => raw.includes(t));
  return tiers.length === CHECKLIST_TIERS.length ? null : tiers;
}

function revalidate(checklistId: string) {
  revalidatePath("/admin/services/checklists");
  revalidatePath(`/admin/services/checklists/${checklistId}`);
}

function duplicateMessage(error: { code?: string; message: string }): string {
  return error.code === "23505" ? "There's already an item with that name in this section." : error.message;
}

export async function renameChecklist(input: { id: string; name: string }): Promise<ChecklistActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const name = cleanLabel(input.name, "checklist");
  if (!name.ok) return name;
  const { error } = await createAdminClient()
    .from("checklists")
    .update({ name: name.value, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate(input.id);
  return { ok: true };
}

export async function addChecklistItem(input: {
  checklistId: string;
  section: string;
  label: string;
  tiers?: string[] | null;
}): Promise<ChecklistActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const section = cleanLabel(input.section, "section");
  if (!section.ok) return section;
  const label = cleanLabel(input.label, "item");
  if (!label.ok) return label;
  const admin = createAdminClient();
  // Append after the last item of the section, so it lands where the admin
  // is looking; renumbering happens on move.
  const { data: last } = await admin
    .from("checklist_items")
    .select("position")
    .eq("checklist_id", input.checklistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from("checklist_items").insert({
    checklist_id: input.checklistId,
    section: section.value,
    label: label.value,
    position: (last?.position ?? -1) + 1,
    tiers: cleanTiers(input.tiers),
  });
  if (error) return { ok: false, error: duplicateMessage(error) };
  revalidate(input.checklistId);
  return { ok: true };
}

export async function renameChecklistItem(input: { id: string; label: string }): Promise<ChecklistActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const label = cleanLabel(input.label, "item");
  if (!label.ok) return label;
  const admin = createAdminClient();
  const { data: item } = await admin.from("checklist_items").select("checklist_id").eq("id", input.id).maybeSingle();
  if (!item) return { ok: false, error: "That item no longer exists." };
  const { error } = await admin
    .from("checklist_items")
    .update({ label: label.value, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: duplicateMessage(error) };
  revalidate(item.checklist_id);
  return { ok: true };
}

export async function renameChecklistSection(input: {
  checklistId: string;
  from: string;
  to: string;
}): Promise<ChecklistActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const to = cleanLabel(input.to, "section");
  if (!to.ok) return to;
  const { error } = await createAdminClient()
    .from("checklist_items")
    .update({ section: to.value, updated_at: new Date().toISOString() })
    .eq("checklist_id", input.checklistId)
    .eq("section", input.from);
  if (error) return { ok: false, error: duplicateMessage(error) };
  revalidate(input.checklistId);
  return { ok: true };
}

export async function setChecklistItemTiers(input: { id: string; tiers: string[] }): Promise<ChecklistActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const tiers = cleanTiers(input.tiers);
  if (tiers != null && tiers.length === 0) return { ok: false, error: "An item has to apply to at least one tier." };
  const admin = createAdminClient();
  const { data: item } = await admin.from("checklist_items").select("checklist_id").eq("id", input.id).maybeSingle();
  if (!item) return { ok: false, error: "That item no longer exists." };
  const { error } = await admin
    .from("checklist_items")
    .update({ tiers, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate(item.checklist_id);
  return { ok: true };
}

export async function setChecklistItemActive(input: { id: string; isActive: boolean }): Promise<ChecklistActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  const { data: item } = await admin.from("checklist_items").select("checklist_id").eq("id", input.id).maybeSingle();
  if (!item) return { ok: false, error: "That item no longer exists." };
  const { error } = await admin
    .from("checklist_items")
    .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate(item.checklist_id);
  return { ok: true };
}

/** Swap with the neighbour above / below within the same section; renumbers the whole checklist so a swap is always a swap. */
export async function moveChecklistItem(input: { id: string; direction: "up" | "down" }): Promise<ChecklistActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  const { data: me } = await admin.from("checklist_items").select("checklist_id, section").eq("id", input.id).maybeSingle();
  if (!me) return { ok: false, error: "That item no longer exists." };
  const { data: all } = await admin
    .from("checklist_items")
    .select("id, section")
    .eq("checklist_id", me.checklist_id)
    .order("position", { ascending: true });
  const list = (all ?? []).map((row, index) => ({ id: row.id, section: row.section, order: index }));
  const index = list.findIndex((s) => s.id === input.id);
  const step = input.direction === "up" ? -1 : 1;
  let other = index + step;
  while (other >= 0 && other < list.length && list[other].section !== me.section) other += step;
  if (other < 0 || other >= list.length) return { ok: true };
  [list[index].order, list[other].order] = [list[other].order, list[index].order];
  for (const s of list) {
    const { error } = await admin.from("checklist_items").update({ position: s.order }).eq("id", s.id);
    if (error) return { ok: false, error: error.message };
  }
  revalidate(me.checklist_id);
  return { ok: true };
}
