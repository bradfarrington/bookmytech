// HaynesPro Data Exchange REST helper for one-off verification scripts.
//
// Mirrors lib/haynespro/client.ts — same endpoint, same two production
// accounts (DX ID for identification, DX Content for everything once the car
// type is known), same statusCode-5 re-auth-once rule. It exists because the
// app client cannot be imported from plain Node: it pulls "server-only" through
// lib/supabase/admin and relies on the "@/" alias, and there is no tsx/ts-node
// in devDependencies.
//
// Sessions differ from the app's on purpose (Task 44):
//   - tokens live in memory for this run only — HaynesPro prohibits caching
//     them, and a script has no other instance to share with;
//   - usernames use a separate probe prefix (HAYNESPRO_PROBE_USERNAME_PREFIX,
//     default "bmtprobe"), because minting a VRID invalidates earlier ones for
//     the same username: a script using the app's prefix would knock out the
//     live site's session for the same vehicle.
//
// Every call names its session: { account: "id", identifier } or
// { account: "content", carTypeId }.
//
// Only used by scripts/*.mjs. Nothing in the app imports this.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const REST_BASE =
  "https://www.haynespro-services.com/workshopServices3/rest/jsonendpoint";
const REQUEST_TIMEOUT_MS = 20_000;

export function requireEnv() {
  const e = process.env;
  const needed = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "HAYNESPRO_ID_DISTRIBUTOR_USERNAME",
    "HAYNESPRO_ID_DISTRIBUTOR_PASSWORD",
    "HAYNESPRO_CONTENT_DISTRIBUTOR_USERNAME",
    "HAYNESPRO_CONTENT_DISTRIBUTOR_PASSWORD",
  ];
  const missing = needed.filter((k) => !e[k]);
  if (missing.length) {
    console.error(`Need ${missing.join(", ")} in .env.local`);
    process.exit(2);
  }
  return {
    url: e.NEXT_PUBLIC_SUPABASE_URL,
    service: e.SUPABASE_SERVICE_ROLE_KEY,
    id: { username: e.HAYNESPRO_ID_DISTRIBUTOR_USERNAME, password: e.HAYNESPRO_ID_DISTRIBUTOR_PASSWORD },
    content: { username: e.HAYNESPRO_CONTENT_DISTRIBUTOR_USERNAME, password: e.HAYNESPRO_CONTENT_DISTRIBUTOR_PASSWORD },
    probePrefix: (e.HAYNESPRO_PROBE_USERNAME_PREFIX || "bmtprobe").replace(/[^A-Za-z0-9]/g, "") || "bmtprobe",
  };
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

/** The DX Content session for a car type. */
export const content = (carTypeId) => ({ account: "content", carTypeId });

/**
 * A REST client for scripts. `call(operation, params, session)` returns the
 * parsed payload, or throws with the HaynesPro status code when the call is
 * rejected after one re-auth — a script should stop loudly, not fall through
 * like the funnel does.
 */
export function createHaynesProRest() {
  const env = requireEnv();
  const db = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** session key → Promise<vrid>. Holding the promise collapses concurrent mints for one session. */
  const tokens = new Map();

  function usernameFor(session) {
    const identifier = session.account === "content" ? session.carTypeId : session.identifier;
    return `${env.probePrefix}_${String(identifier).replace(/[^A-Za-z0-9]/g, "") || "unknown"}`.slice(0, 32);
  }

  async function mint(session, username) {
    const creds = env[session.account];
    const body = await rawCall("getAuthenticationVrid", {
      distributorUsername: creds.username,
      distributorPassword: creds.password,
      username,
    });
    if (body?.statusCode === 0 && body.vrid) return body.vrid;
    const name = session.account === "id" ? "DX ID" : "DX Content";
    throw new Error(`HaynesPro ${name} auth failed for "${username}", statusCode ${body?.statusCode ?? "?"}`);
  }

  /** The session's VRID; mints when there is none, or when the one held is `stale`. */
  async function vridFor(session, stale = null) {
    const username = usernameFor(session);
    const key = `${session.account}:${username}`;
    const pending = tokens.get(key);
    if (pending) {
      const vrid = await pending;
      if (vrid !== stale) return vrid;
      if (tokens.get(key) !== pending) return vridFor(session, stale);
    }
    const minting = mint(session, username);
    tokens.set(key, minting);
    minting.catch(() => {
      if (tokens.get(key) === minting) tokens.delete(key);
    });
    return minting;
  }

  async function call(operation, params, session) {
    if (session?.account !== "id" && session?.account !== "content") {
      throw new Error(`HaynesPro ${operation}: every call needs a session ({account: "id"|"content", …})`);
    }
    const vrid = await vridFor(session);
    let payload = await rawCall(operation, { ...params, vrid });
    if (extractStatusCode(payload) !== 5) return payload;

    const retryVrid = await vridFor(session, vrid);
    payload = await rawCall(operation, { ...params, vrid: retryVrid });
    if (extractStatusCode(payload) === 5) {
      throw new Error(`HaynesPro ${operation} still rejected after re-auth`);
    }
    return payload;
  }

  // -- Conveniences mirroring lib/haynespro/tree.ts ------------------------

  const tree = (params, identifier) =>
    call(
      "getIdentificationTreeV2",
      { descriptionLanguage: "en", filter_category: "PASSENGER", ...params },
      { account: "id", identifier },
    );

  return {
    db,
    call,
    async getMakes() {
      const root = await tree({ vehicle_level: "ROOT", filter_toVehicleLevel: "MAKE" }, "browse");
      return root?.subElements ?? [];
    },
    async getMakeModels(makeId) {
      const make = await tree(
        { vehicle_id: makeId, vehicle_level: "MAKE", filter_toVehicleLevel: "MODEL" },
        "browse",
      );
      return make?.subElements ?? [];
    },
    async getModelTypes(modelId) {
      const model = await tree(
        { vehicle_id: modelId, vehicle_level: "MODEL", filter_toVehicleLevel: "TYPE" },
        "browse",
      );
      return { model, types: (model?.subElements ?? []).filter((t) => t.id != null) };
    },
    async getCarTypeNode(carTypeId) {
      const node = await tree(
        { vehicle_id: carTypeId, vehicle_level: "TYPE", filter_toVehicleLevel: "TYPE" },
        carTypeId,
      );
      return node?.id == null ? null : node;
    },
    async getRepairtimeTypeId(carTypeId) {
      const types = await call(
        "getRepairtimeTypesV2",
        { descriptionLanguage: "en", carTypeId },
        content(carTypeId),
      );
      for (const t of types ?? []) if (t.repairtimeTypeId != null) return t.repairtimeTypeId;
      return null;
    },
    /** `vehicle` is { carTypeId, repairtimeTypeId }. */
    async getSubnodes(vehicle, nodeId) {
      const nodes = await call(
        "getRepairtimeSubnodesByGroupV4",
        { descriptionLanguage: "en", repairtimeTypeId: vehicle.repairtimeTypeId, typeCategory: "CAR", nodeId },
        content(vehicle.carTypeId),
      );
      return nodes ?? [];
    },
    /** `vehicle` is { carTypeId, repairtimeTypeId }. */
    async getNodesByIds(vehicle, nodeIds) {
      const nodes = await call(
        "getRepairtimeNodesV4",
        { descriptionLanguage: "en", repairtimeTypeId: vehicle.repairtimeTypeId, typeCategory: "CAR", nodesIds: nodeIds },
        content(vehicle.carTypeId),
      );
      return nodes ?? [];
    },
  };
}

/** Uppercase + collapse whitespace — the same normalisation as exclusions.ts. */
export function norm(s) {
  return (s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}
