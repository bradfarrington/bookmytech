"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { customGroupId, isCustomGroupId, uniqueIds } from "@/lib/catalogue/overlay";
import { searchJobsForCarType } from "@/lib/haynespro/catalogue";
import { getReferenceVehicle } from "@/lib/haynespro/reference-vehicle";

// The admin's layer over HaynesPro's repair tree (Task 26): categories we
// create, per-node names and moves, and combined repairs. Every write goes
// through the service-role client after an admin check; the customer
// catalogue (lib/haynespro/catalogue.ts) reads the result on every request,
// so a change is live at once.

export type CatalogueResult = { ok: true } | { ok: false; error: string };
export type CatalogueCreateResult = { ok: true; id: string } | { ok: false; error: string };

const MAX_NAME = 80;

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only." };
  return { ok: true };
}

function cleanName(raw: string, what: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: `Give the ${what} a name.` };
  if (name.length > MAX_NAME) return { ok: false, error: `Keep the ${what} name under ${MAX_NAME} characters.` };
  return { ok: true, name };
}

function cleanParent(raw: string | null | undefined): string {
  const parent = (raw ?? "").trim();
  return parent || "root";
}

function revalidate() {
  revalidatePath("/admin/repairs", "layout");
  revalidatePath("/admin/vehicles", "layout");
  revalidatePath("/book/repairs");
}

// --- Categories ------------------------------------------------------------

export async function createCatalogueGroup(input: {
  name: string;
  parentId: string;
}): Promise<CatalogueCreateResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const named = cleanName(input.name, "category");
  if (!named.ok) return named;
  const { data, error } = await createAdminClient()
    .from("repair_catalogue_groups")
    .insert({ name: named.name, parent_id: cleanParent(input.parentId) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the category." };
  revalidate();
  return { ok: true, id: data.id };
}

export async function renameCatalogueGroup(input: { id: string; name: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const named = cleanName(input.name, "category");
  if (!named.ok) return named;
  const { error } = await createAdminClient()
    .from("repair_catalogue_groups")
    .update({ name: named.name, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function moveCatalogueGroup(input: { id: string; parentId: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parentId = cleanParent(input.parentId);
  if (parentId === customGroupId(input.id)) return { ok: false, error: "A category can't live inside itself." };
  const { error } = await createAdminClient()
    .from("repair_catalogue_groups")
    .update({ parent_id: parentId, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/**
 * Delete a category. Whatever was in it goes back where it came from: moved
 * jobs return to HaynesPro's own place, combined repairs and child categories
 * go to the top level.
 */
export async function deleteCatalogueGroup(input: { id: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  const groupId = customGroupId(input.id);
  const steps = [
    admin.from("repair_catalogue_overrides").update({ parent_id: null }).eq("parent_id", groupId),
    admin.from("repair_bundles").update({ parent_id: "root" }).eq("parent_id", groupId),
    admin.from("repair_catalogue_groups").update({ parent_id: "root" }).eq("parent_id", groupId),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await admin.from("repair_catalogue_groups").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

// --- HaynesPro nodes: names and moves --------------------------------------

async function upsertOverride(
  patch: { custom_name?: string | null; parent_id?: string | null },
  node: { nodeId: string; kind: "group" | "repair"; description?: string | null },
): Promise<CatalogueResult> {
  const nodeId = node.nodeId.trim();
  if (!nodeId || isCustomGroupId(nodeId)) return { ok: false, error: "Missing repair." };
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("repair_catalogue_overrides")
    .select("custom_name, parent_id, description")
    .eq("node_id", nodeId)
    .maybeSingle();
  const next = {
    node_id: nodeId,
    kind: node.kind,
    description: existing?.description ?? node.description?.trim() ?? null,
    custom_name: "custom_name" in patch ? patch.custom_name : (existing?.custom_name ?? null),
    parent_id: "parent_id" in patch ? patch.parent_id : (existing?.parent_id ?? null),
    updated_at: new Date().toISOString(),
  };
  // Nothing left to say about this node → drop the row rather than keep an empty one.
  if (!next.custom_name && !next.parent_id) {
    const { error } = await admin.from("repair_catalogue_overrides").delete().eq("node_id", nodeId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin
      .from("repair_catalogue_overrides")
      .upsert(next, { onConflict: "node_id" });
    if (error) return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}

/** Give a HaynesPro group or job our own name; null puts HaynesPro's back. */
export async function setNodeName(input: {
  nodeId: string;
  kind: "group" | "repair";
  description?: string | null;
  name: string | null;
}): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  let custom_name: string | null = null;
  if (input.name != null && input.name.trim()) {
    const named = cleanName(input.name, "repair");
    if (!named.ok) return named;
    custom_name = named.name;
  }
  return upsertOverride({ custom_name }, input);
}

/** List a HaynesPro group or job under another category; null puts it back where HaynesPro lists it. */
export async function moveNode(input: {
  nodeId: string;
  kind: "group" | "repair";
  description?: string | null;
  parentId: string | null;
}): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parent_id = input.parentId ? cleanParent(input.parentId) : null;
  if (parent_id === input.nodeId) return { ok: false, error: "A group can't live inside itself." };
  return upsertOverride({ parent_id }, input);
}

// --- Combined repairs ------------------------------------------------------
//
// A combined repair holds a POOL of jobs (repair_bundles.node_ids), added once
// — from a job's row in the tree or the search box on the card. Each option
// ("Front", "Rear", "All round") ticks a subset of the pool; that subset is
// what the customer books. Adding a job to a bundle that has exactly one
// option also ticks it there, so a simple one-option combined repair just
// works; with several options the admin ticks where it belongs.

export async function createBundle(input: {
  name: string;
  parentId: string;
  optionLabel: string;
  nodeId: string;
}): Promise<CatalogueCreateResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const named = cleanName(input.name, "combined repair");
  if (!named.ok) return named;
  const label = cleanName(input.optionLabel || "Standard", "option");
  if (!label.ok) return label;
  const nodeId = input.nodeId.trim();
  if (!nodeId) return { ok: false, error: "Pick the first job to combine." };

  const admin = createAdminClient();
  const { data: bundle, error } = await admin
    .from("repair_bundles")
    .insert({ name: named.name, parent_id: cleanParent(input.parentId), node_ids: [nodeId] })
    .select("id")
    .single();
  if (error || !bundle) return { ok: false, error: error?.message ?? "Couldn't create the combined repair." };
  const { error: optionError } = await admin
    .from("repair_bundle_options")
    .insert({ bundle_id: bundle.id, label: label.name, node_ids: [nodeId], position: 0 });
  if (optionError) {
    await admin.from("repair_bundles").delete().eq("id", bundle.id);
    return { ok: false, error: optionError.message };
  }
  revalidate();
  return { ok: true, id: bundle.id };
}

/** Add a job to a combined repair's pool (and to its only option, if it has just one). */
export async function addNodeToBundle(input: { bundleId: string; nodeId: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const nodeId = input.nodeId.trim();
  if (!nodeId || isCustomGroupId(nodeId)) return { ok: false, error: "Only a timed repair can be combined." };

  const admin = createAdminClient();
  const [{ data: bundle, error: readError }, { data: options }] = await Promise.all([
    admin.from("repair_bundles").select("node_ids").eq("id", input.bundleId).maybeSingle(),
    admin.from("repair_bundle_options").select("id, node_ids").eq("bundle_id", input.bundleId),
  ]);
  if (readError) return { ok: false, error: readError.message };
  if (!bundle) return { ok: false, error: "That combined repair no longer exists." };

  const { error } = await admin
    .from("repair_bundles")
    .update({ node_ids: uniqueIds([...(bundle.node_ids ?? []), nodeId]), updated_at: new Date().toISOString() })
    .eq("id", input.bundleId);
  if (error) return { ok: false, error: error.message };

  if ((options ?? []).length === 1) {
    const only = options![0];
    const { error: optionError } = await admin
      .from("repair_bundle_options")
      .update({ node_ids: uniqueIds([...(only.node_ids ?? []), nodeId]) })
      .eq("id", only.id);
    if (optionError) return { ok: false, error: optionError.message };
  }
  revalidate();
  return { ok: true };
}

/** Remove a job from the pool — and from every option that ticked it. */
export async function removeNodeFromBundle(input: { bundleId: string; nodeId: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  const [{ data: bundle, error: readError }, { data: options }] = await Promise.all([
    admin.from("repair_bundles").select("node_ids").eq("id", input.bundleId).maybeSingle(),
    admin.from("repair_bundle_options").select("id, node_ids").eq("bundle_id", input.bundleId),
  ]);
  if (readError) return { ok: false, error: readError.message };
  if (!bundle) return { ok: false, error: "That combined repair no longer exists." };

  const { error } = await admin
    .from("repair_bundles")
    .update({
      node_ids: (bundle.node_ids ?? []).filter((id: string) => id !== input.nodeId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.bundleId);
  if (error) return { ok: false, error: error.message };
  for (const option of options ?? []) {
    if (!(option.node_ids ?? []).includes(input.nodeId)) continue;
    const { error: optionError } = await admin
      .from("repair_bundle_options")
      .update({ node_ids: (option.node_ids ?? []).filter((id: string) => id !== input.nodeId) })
      .eq("id", option.id);
    if (optionError) return { ok: false, error: optionError.message };
  }
  revalidate();
  return { ok: true };
}

/** Tick or untick one of the pool's jobs for an option. */
export async function setOptionJob(input: {
  optionId: string;
  nodeId: string;
  included: boolean;
}): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  const { data: option, error: readError } = await admin
    .from("repair_bundle_options")
    .select("node_ids, bundle:repair_bundles(node_ids)")
    .eq("id", input.optionId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!option) return { ok: false, error: "That option no longer exists." };
  const bundle = Array.isArray(option.bundle) ? option.bundle[0] : option.bundle;
  const pool: string[] = bundle?.node_ids ?? [];
  if (input.included && !pool.includes(input.nodeId)) {
    return { ok: false, error: "Add the job to the combined repair first." };
  }
  const current: string[] = option.node_ids ?? [];
  const next = input.included
    ? uniqueIds([...current, input.nodeId])
    : current.filter((id) => id !== input.nodeId);
  const { error } = await admin
    .from("repair_bundle_options")
    .update({ node_ids: next })
    .eq("id", input.optionId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export type JobSearchResult =
  | { ok: true; hits: Array<{ id: string; description: string; billedHours: number | null }>; truncated: boolean }
  | { ok: false; error: string };

/** Find HaynesPro jobs by name on the reference vehicle — the search box on a combined repair's card. */
export async function searchJobsForBundle(input: { query: string }): Promise<JobSearchResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const query = input.query.trim();
  if (query.length < 3) return { ok: true, hits: [], truncated: false };
  const admin = createAdminClient();
  const reference = await getReferenceVehicle(admin);
  const result = await searchJobsForCarType(reference.carTypeId, query, admin);
  if (!result.ok) return { ok: false, error: result.message };
  return {
    ok: true,
    hits: result.hits
      .filter((h) => h.kind === "repair")
      .map((h) => ({ id: h.id, description: h.description, billedHours: h.billedHours })),
    truncated: result.truncated,
  };
}

export async function renameBundle(input: { id: string; name: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const named = cleanName(input.name, "combined repair");
  if (!named.ok) return named;
  const { error } = await createAdminClient()
    .from("repair_bundles")
    .update({ name: named.name, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function moveBundle(input: { id: string; parentId: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await createAdminClient()
    .from("repair_bundles")
    .update({ parent_id: cleanParent(input.parentId), updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function setBundleActive(input: { id: string; active: boolean }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await createAdminClient()
    .from("repair_bundles")
    .update({ is_active: input.active, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteBundle(input: { id: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  // Options cascade with the bundle (0056).
  const { error } = await createAdminClient().from("repair_bundles").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function addBundleOption(input: {
  bundleId: string;
  label: string;
}): Promise<CatalogueCreateResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const label = cleanName(input.label, "option");
  if (!label.ok) return label;
  const admin = createAdminClient();
  const { count } = await admin
    .from("repair_bundle_options")
    .select("id", { count: "exact", head: true })
    .eq("bundle_id", input.bundleId);
  const { data, error } = await admin
    .from("repair_bundle_options")
    .insert({ bundle_id: input.bundleId, label: label.name, node_ids: [], position: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't add the option." };
  revalidate();
  return { ok: true, id: data.id };
}

export async function renameBundleOption(input: { id: string; label: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const label = cleanName(input.label, "option");
  if (!label.ok) return label;
  const { error } = await createAdminClient()
    .from("repair_bundle_options")
    .update({ label: label.name })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteBundleOption(input: { id: string }): Promise<CatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await createAdminClient().from("repair_bundle_options").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

