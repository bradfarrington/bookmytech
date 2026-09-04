"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GLOBAL_SCOPE } from "@/lib/haynespro/exclusions";

// Repair availability toggles (Task 16 Stage G follow-up; global scope and
// per-model overrides in Task 23). Every repair-tree node is ON for every
// vehicle by default. Rows in repair_vehicle_exclusions switch that:
//
//   scope "global"  → ('*', '*', node, 'hide')       hidden for all vehicles
//   scope "model"   → (make, model, node, 'hide')    hidden for that model
//                     (make, model, node, 'show')    shown there despite a global hide
//
// Per-model rows key on HaynesPro make/model NAMES (stable across their
// quarterly database updates — the numeric ids are not). A model holds at most
// one row per node (unique key), so a toggle either flips its mode or deletes
// it. What a flip means depends on whether the node is hidden globally, which
// the server reads itself — the client only ever says "available: yes/no".

export type ExclusionResult = { ok: true } | { ok: false; error: string };

export type ExclusionTarget =
  | { scope: "global" }
  | { scope: "model"; makeName: string; modelName: string };

const TABLE = "repair_vehicle_exclusions";
const CONFLICT = "make_name,model_name,node_id";

async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
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
  return { ok: true, adminId: user.id };
}

export async function setRepairVehicleAvailability(
  input: ExclusionTarget & {
    nodeId: string;
    description?: string | null;
    available: boolean;
  },
): Promise<ExclusionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const nodeId = input.nodeId.trim();
  if (!nodeId) return { ok: false, error: "Missing repair." };
  const description = input.description?.trim() || null;
  const admin = createAdminClient();

  if (input.scope === "global") {
    if (input.available) {
      // Lift the global hide, then drop every per-model 'show' override for
      // the node — they only ever existed to punch through that hide.
      const lifted = await admin
        .from(TABLE)
        .delete()
        .eq("make_name", GLOBAL_SCOPE)
        .eq("model_name", GLOBAL_SCOPE)
        .eq("node_id", nodeId);
      if (lifted.error) return { ok: false, error: lifted.error.message };
      const overrides = await admin
        .from(TABLE)
        .delete()
        .eq("node_id", nodeId)
        .eq("mode", "show");
      if (overrides.error) return { ok: false, error: overrides.error.message };
    } else {
      const { error } = await admin.from(TABLE).upsert(
        {
          make_name: GLOBAL_SCOPE,
          model_name: GLOBAL_SCOPE,
          node_id: nodeId,
          description,
          mode: "hide",
        },
        { onConflict: CONFLICT },
      );
      if (error) return { ok: false, error: error.message };
    }
  } else {
    const makeName = input.makeName.trim();
    const modelName = input.modelName.trim();
    // A partial wildcard ('*' + a real model, or vice versa) would be a row
    // that matches nothing in the funnel yet looks like a hide in the admin.
    if (
      !makeName ||
      !modelName ||
      makeName === GLOBAL_SCOPE ||
      modelName === GLOBAL_SCOPE
    ) {
      return { ok: false, error: "Missing repair or vehicle." };
    }

    const globalRow = await admin
      .from(TABLE)
      .select("id")
      .eq("make_name", GLOBAL_SCOPE)
      .eq("model_name", GLOBAL_SCOPE)
      .eq("node_id", nodeId)
      .eq("mode", "hide")
      .maybeSingle();
    if (globalRow.error) return { ok: false, error: globalRow.error.message };
    const hiddenGlobally = globalRow.data != null;

    // With a global hide in place, "available" is an override row and "not
    // available" is simply the default (delete the override). Without one it
    // is the original per-model hide.
    const writeMode: "show" | "hide" | null = input.available
      ? hiddenGlobally
        ? "show"
        : null
      : hiddenGlobally
        ? null
        : "hide";

    if (writeMode) {
      const { error } = await admin.from(TABLE).upsert(
        {
          make_name: makeName,
          model_name: modelName,
          node_id: nodeId,
          description,
          mode: writeMode,
        },
        { onConflict: CONFLICT },
      );
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await admin
        .from(TABLE)
        .delete()
        .eq("make_name", makeName)
        .eq("model_name", modelName)
        .eq("node_id", nodeId);
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath("/admin/vehicles", "layout");
  return { ok: true };
}
