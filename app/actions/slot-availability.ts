"use server";

import { headers } from "next/headers";
import { slotAvailabilityFor } from "@/lib/availability/slot-availability";
import {
  DAY_SECONDS,
  MINUTE_SECONDS,
  enforceRateLimits,
  type RateLimitRule,
} from "@/lib/rate-limit/limiter";
import { isDayKey } from "@/lib/slots";
import { createClient } from "@/lib/supabase/server";

// Mechanics free per arrival window (Task 54), for the booking funnel's Time
// step. The website's twin of GET /api/mobile/v1/slots: both are thin wrappers
// over lib/availability/slot-availability.ts, so the two counts can't disagree.
//
// PUBLICLY CALLABLE. Every export of a "use server" file is an endpoint anyone
// can hit with arguments of their choosing, and each call geocodes a postcode
// and reads every mechanic's calendar. So the inputs are checked here and the
// same `slots` rate-limit buckets as the mobile route apply: per address always,
// per user when signed in. Only the counts go back, never who.

export interface WindowMechanicCount {
  /** "8am–10am" … "6pm–8pm", or "All day (8am–8pm)": the picker's own labels. */
  window: string;
  mechanics: number;
  /** Still far enough ahead to book. */
  bookable: boolean;
}

export type SlotAvailabilityActionResult =
  | { ok: true; day: string; areaChecked: boolean; windows: WindowMechanicCount[] }
  | { ok: false; error: string };

/** Loose on purpose: it's a count to show, not an address to save. */
const POSTCODE_SHAPE = /^[A-Z0-9 ]{2,10}$/;

/** First `x-forwarded-for` entry, as `clientIp` in lib/mobile/respond.ts reads it. */
function ipFrom(requestHeaders: Headers): string {
  const first = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  return requestHeaders.get("x-real-ip")?.trim() || "unknown";
}

export async function checkSlotAvailability(
  day: string,
  postcode: string | null,
): Promise<SlotAvailabilityActionResult> {
  // Runtime checks, not just types: the browser can send anything.
  if (typeof day !== "string" || !isDayKey(day)) {
    return { ok: false, error: "Choose a day to see who's free." };
  }
  let area: string | null = null;
  if (postcode !== null && postcode !== undefined) {
    if (typeof postcode !== "string") return { ok: false, error: "Enter a valid postcode." };
    const cleaned = postcode.trim().toUpperCase();
    if (cleaned && !POSTCODE_SHAPE.test(cleaned)) {
      return { ok: false, error: "Enter a valid postcode." };
    }
    area = cleaned || null;
  }

  try {
    const requestHeaders = await headers();
    const ip = ipFrom(requestHeaders);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const rules: RateLimitRule[] = [];
    if (user) {
      rules.push(
        { key: "mobile_slots_user_burst", subject: `user:${user.id}`, windowSeconds: MINUTE_SECONDS },
        { key: "mobile_slots_user_daily", subject: `user:${user.id}`, windowSeconds: DAY_SECONDS },
      );
    }
    rules.push(
      { key: "mobile_slots_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
      { key: "mobile_slots_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
    );
    const verdict = await enforceRateLimits(rules);
    if (!verdict.allowed) {
      return {
        ok: false,
        error: "You've checked availability a lot just now. Please wait a moment and try again.",
      };
    }

    const result = await slotAvailabilityFor(day, area);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      day: result.day,
      areaChecked: result.areaChecked,
      windows: result.windows.map(({ window, mechanics, bookable }) => ({ window, mechanics, bookable })),
    };
  } catch (error) {
    console.error("[slots] web availability failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "We couldn't check who's free just now. Please try again." };
  }
}
