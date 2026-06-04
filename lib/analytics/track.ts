"use client";

import { trackEvent } from "@/app/actions/track-event";

// Client-side funnel tracking helper. Thin wrapper over the trackEvent server
// action that's fire-and-forget and can never throw into the caller — drop a
// `track("service_selected")` anywhere in the booking flow without worrying
// about awaiting it or guarding it.

// Re-export the step names so existing client call sites can keep importing
// FUNNEL_EVENTS from here; the source of truth is the plain module.
export { FUNNEL_EVENTS } from "@/lib/analytics/events";

export function track(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  // Don't await — tracking should never delay navigation or interaction.
  void trackEvent(eventName, properties).catch(() => {});
}
