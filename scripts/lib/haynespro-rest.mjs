// HaynesPro Data Exchange REST helper for one-off verification scripts.
//
// Mirrors lib/haynespro/client.ts — same endpoint, same shared-VRID handling
// (the token lives in platform_settings.haynespro_vrid so serverless instances
// and this script never invalidate each other's session), same statusCode-5
// re-auth-once rule. It exists because the app client cannot be imported from
// plain Node: it pulls "server-only" through lib/supabase/admin and relies on
// the "@/" alias, and there is no tsx/ts-node in devDependencies.
//
// Only used by scripts/verify-*.mjs. Nothing in the app imports this.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const REST_BASE =
  "https://www.haynespro-services.com/workshopServices3/rest/jsonendpoint";
const VRID_SETTINGS_KEY = "haynespro_vrid";
const REQUEST_TIMEOUT_MS = 20_000;

export function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const distributorUsername = process.env.HAYNESPRO_DISTRIBUTOR_USERNAME;
  const distributorPassword = process.env.HAYNESPRO_DISTRIBUTOR_PASSWORD;
  const username = process.env.HAYNESPRO_USERNAME || "bookmytech";
  if (!url || !service || !distributorUsername || !distributorPassword) {
    console.error(
      "Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HAYNESPRO_DISTRIBUTOR_USERNAME, HAYNESPRO_DISTRIBUTOR_PASSWORD in .env.local",
    );
    process.exit(2);
  }
  return { url, service, distributorUsername, distributorPassword, username };
}

/** Same envelope reading as lib/haynespro/client.ts extractStatusCode. */
export function extractStatusCode(payload) {
  const fromObject = (obj) => {
    if (obj == null || typeof obj !== "object") return null;
    if (typeof obj.statusCode === "number") return obj.statusCode;
    if (obj.status && typeof obj.status.statusCode === "number") return obj.status.statusCode;
    return null;
  };
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const code = fromObject(item);
      if (code != null && code !== 0) return code;
    }
    return null;
  }
  return fromObject(payload);
}

function buildUrl(operation, params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) for (const v of value) qs.append(key, String(v));
    else qs.set(key, String(value));
  }
  return `${REST_BASE}/${operation}?${qs.toString()}`;
}

async function rawCall(operation, params) {
  const res = await fetch(buildUrl(operation, params), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HaynesPro ${operation} responded ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * A REST client sharing the app's persisted VRID. `call(operation, params)`
 * returns the parsed payload, or throws with the HaynesPro status code when the
 * call is rejected after one re-auth — a script should stop loudly, not fall
 * through like the funnel does.
 */
export function createHaynesProRest() {
  const env = requireEnv();
  const db = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function readStoredVrid() {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", VRID_SETTINGS_KEY)
      .maybeSingle();
    const raw = data?.value;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }

  async function storeVrid(vrid) {
    await db
      .from("platform_settings")
      .upsert({ key: VRID_SETTINGS_KEY, value: vrid, updated_at: new Date().toISOString() });
  }

  async function mintVrid() {
    const body = await rawCall("getAuthenticationVrid", {
      distributorUsername: env.distributorUsername,
      distributorPassword: env.distributorPassword,
      username: env.username,
    });
    if (body?.statusCode === 0 && body.vrid) return body.vrid;
    throw new Error(`HaynesPro auth failed, statusCode ${body?.statusCode ?? "?"}`);
  }

  async function call(operation, params) {
    let vrid = await readStoredVrid();
    if (!vrid) {
      vrid = await mintVrid();
      await storeVrid(vrid);
    }
    let payload = await rawCall(operation, { ...params, vrid });
    if (extractStatusCode(payload) !== 5) return payload;

    const latest = await readStoredVrid();
    let retryVrid = latest && latest !== vrid ? latest : null;
    if (!retryVrid) {
      retryVrid = await mintVrid();
      await storeVrid(retryVrid);
    }
    payload = await rawCall(operation, { ...params, vrid: retryVrid });
    if (extractStatusCode(payload) === 5) {
      throw new Error(`HaynesPro ${operation} still rejected after re-auth`);
    }
    return payload;
  }

  // -- Typed conveniences mirroring lib/haynespro/tree.ts ------------------

  const tree = (params) =>
    call("getIdentificationTreeV2", {
      descriptionLanguage: "en",
      filter_category: "PASSENGER",
      ...params,
    });

  return {
    db,
    call,
    async getMakes() {
      const root = await tree({ vehicle_level: "ROOT", filter_toVehicleLevel: "MAKE" });
      return root?.subElements ?? [];
    },
    async getMakeModels(makeId) {
      const make = await tree({
        vehicle_id: makeId,
        vehicle_level: "MAKE",
        filter_toVehicleLevel: "MODEL",
      });
      return make?.subElements ?? [];
    },
    async getModelTypes(modelId) {
      const model = await tree({
        vehicle_id: modelId,
        vehicle_level: "MODEL",
        filter_toVehicleLevel: "TYPE",
      });
      return { model, types: (model?.subElements ?? []).filter((t) => t.id != null) };
    },
    async getCarTypeNode(carTypeId) {
      const node = await tree({
        vehicle_id: carTypeId,
        vehicle_level: "TYPE",
        filter_toVehicleLevel: "TYPE",
      });
      return node?.id == null ? null : node;
    },
    async getRepairtimeTypeId(carTypeId) {
      const types = await call("getRepairtimeTypesV2", {
        descriptionLanguage: "en",
        carTypeId,
      });
      for (const t of types ?? []) if (t.repairtimeTypeId != null) return t.repairtimeTypeId;
      return null;
    },
    async getSubnodes(repairtimeTypeId, nodeId) {
      const nodes = await call("getRepairtimeSubnodesByGroupV4", {
        descriptionLanguage: "en",
        repairtimeTypeId,
        typeCategory: "CAR",
        nodeId,
      });
      return nodes ?? [];
    },
    async getNodesByIds(repairtimeTypeId, nodeIds) {
      const nodes = await call("getRepairtimeNodesV4", {
        descriptionLanguage: "en",
        repairtimeTypeId,
        typeCategory: "CAR",
        nodesIds: nodeIds,
      });
      return nodes ?? [];
    },
  };
}

/** Uppercase + collapse whitespace — the same normalisation as exclusions.ts. */
export function norm(s) {
  return (s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}
