"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-vehicle service availability toggles (Task 16 Stage D/E). Services are
// ON for every vehicle by default; an exclusion row switches one OFF for a
// model. Rows key on HaynesPro make/model NAMES (stable across their quarterly
// database updates — the numeric ids are not).

export type ExclusionResult = { ok: true } | { ok: false; error: string };

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

export async function setRepairVehicleAvailability(input: {
  makeName: string;
  modelName: string;
  nodeId: string;
  description?: string | null;
  available: boolean;
}): Promise<ExclusionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const makeName = input.makeName.trim();
  const modelName = input.modelName.trim();
  const nodeId = input.nodeId.trim();
  if (!makeName || !modelName || !nodeId) {
    return { ok: false, error: "Missing repair or vehicle." };
  }

  const admin = createAdminClient();
  if (input.available) {
    const { error } = await admin
      .from("repair_vehicle_exclusions")
      .delete()
      .eq("make_name", makeName)
      .eq("model_name", modelName)
      .eq("node_id", nodeId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("repair_vehicle_exclusions").upsert(
      {
        make_name: makeName,
        model_name: modelName,
        node_id: nodeId,
        description: input.description?.trim() || null,
      },
      { onConflict: "make_name,model_name,node_id" },
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/vehicles");
  return { ok: true };
}

export async function setServiceVehicleAvailability(input: {
  serviceId: string;
  makeName: string;
  modelName: string;
  available: boolean;
}): Promise<ExclusionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const makeName = input.makeName.trim();
  const modelName = input.modelName.trim();
  if (!input.serviceId || !makeName || !modelName) {
    return { ok: false, error: "Missing service or vehicle." };
  }

  const admin = createAdminClient();
  if (input.available) {
    const { error } = await admin
      .from("service_vehicle_exclusions")
      .delete()
      .eq("service_id", input.serviceId)
      .eq("make_name", makeName)
      .eq("model_name", modelName);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("service_vehicle_exclusions").upsert(
      { service_id: input.serviceId, make_name: makeName, model_name: modelName },
      { onConflict: "service_id,make_name,model_name" },
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/vehicles");
  return { ok: true };
}
