// The canonical five booking-funnel step names. Kept in a plain (non-client)
// module so both server components and the client `track()` helper can import
// them without pulling the client graph. Mirror the ordered list in
// analytics_funnel() (migration 0020).
export const FUNNEL_EVENTS = {
  regLookupStarted: "reg_lookup_started",
  serviceSelected: "service_selected",
  priceViewed: "price_viewed",
  slotPicked: "slot_picked",
  bookingConfirmed: "booking_confirmed",
} as const;
