"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createBooking,
  prepareCheckoutFor,
  type CreateBookingInput,
  type CreateBookingResult,
  type PrepareCheckoutInput,
} from "@/lib/bookings/create-booking";

// The WEBSITE's entry points into the booking core. Both are thin wrappers whose
// only job is to answer "who is booking?" from the session COOKIE and hand that
// to lib/bookings/create-booking.ts, which holds the logic and is shared with the
// mobile route handlers (app/api/mobile/v1/checkout/prepare, .../bookings).
//
// The customer id is deliberately NOT a parameter of these functions. Every
// export of a "use server" file is a public endpoint the browser can call with
// arguments of its choosing, so a `customerId` argument here would let anyone
// attach a booking to anyone else's account. Mobile threads its caller through
// explicitly because it resolves that caller from a verified Bearer token in a
// route handler, where nothing is client-supplied either.
//
// `getUser()` rather than `getSession()`: it verifies the JWT with Supabase
// instead of trusting the cookie's claims, which is what you want before writing
// a row that owns money.

export type {
  PaymentMode,
  CreateBookingInput,
  CreateBookingResult,
  PrepareCheckoutResult,
} from "@/lib/bookings/create-booking";

export async function createBookingAction(
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return createBooking(input, user?.id ?? null);
}

export async function prepareCheckout(input: PrepareCheckoutInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return prepareCheckoutFor(input, user?.id ?? null);
}
