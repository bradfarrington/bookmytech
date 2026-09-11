// Fitment columns from an ADS parts reply (Task 42). Pure — no I/O.
//
// These live apart from ads.ts deliberately. ads.ts reaches the network and
// dynamically imports the service-role Supabase client; anything importing it
// drags that into the bundle, and a client component doing so fails the build.
// The fitment helpers are needed by lib/parts/supplier-offer.ts, which IS
// reachable from a client component, so they must stay free of all that.
//
// ADS does not hard-code its own column names: the reply carries a
// Configuration.Columns list mapping "Column1" → "Brake Size", "Column4" →
// "Outer diameter [mm]", and so on, PER COMPONENT. Labels therefore come from
// the reply itself and never from a guessed constant — the columns mean
// different things for a brake disc than for a battery.

import type { AdsPartsReply } from "./types";

/** BindingName ("Column1") → DisplayName ("Brake Size"), visible columns only. */
export function fitmentLabels(reply: AdsPartsReply | null | undefined): Map<string, string> {
  const labels = new Map<string, string>();
  for (const column of reply?.Configuration?.Columns ?? []) {
    const key = column?.BindingName || column?.UniqueName;
    const label = column?.DisplayName;
    if (!key || !label) continue;
    if (column?.IsVisible === false) continue;
    labels.set(key, label);
  }
  return labels;
}

/** Labelled, non-empty fitment values for one part, in column order. */
export function fitmentOf(
  part: { DynamicProperties?: Record<string, string> | null },
  labels: Map<string, string>,
): Array<{ label: string; value: string }> {
  const props = part?.DynamicProperties ?? {};
  const out: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(props)) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const label = labels.get(key);
    if (!label) continue;
    out.push({ label, value: text });
  }
  return out;
}
