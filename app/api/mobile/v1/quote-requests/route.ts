import { requestCustomQuote, enforceQuoteRequestLimits } from "@/lib/custom-quotes/server";
import { staffRefusal } from "@/lib/mobile/booking-guards";
import { apiError, apiOk, clientIp, readJsonBody } from "@/lib/mobile/respond";
import { optionalMobileUser } from "@/lib/supabase/mobile";

// POST /api/mobile/v1/quote-requests — "Can't find your job? Ask us for a
// quote" (Task 75). Guests may ask; with a valid Bearer token the request is
// tied to that account and uses the account's email (the `email` field is
// then ignored), so the quote can later be booked from the app.
//
// Body: { reg, description, name, email?, phone?, postcode?, make?, model? }
// 200:  { ok: true, quoteId } | { ok: false, error }  (a refused request that
//       ran: missing name, too-short description… — show `error` verbatim)
// 429:  too many requests (tight: every request emails the admin and the customer)
//
// The admin prices it in the dashboard and the customer gets an email (and a
// text with a phone number) with a link. It then shows in GET /custom-quotes.
// Thin wrapper over lib/custom-quotes/server.ts, the same code as the website.

interface RequestBody {
  reg?: unknown;
  make?: unknown;
  model?: unknown;
  description?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  postcode?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<RequestBody>(request);
  if (!parsed.ok) return parsed.response;

  const caller = await optionalMobileUser(request);
  if (caller) {
    const refusal = staffRefusal(caller);
    if (refusal) return refusal;
  }

  const limited = await enforceQuoteRequestLimits({ userId: caller?.userId ?? null, ip: clientIp(request) });
  if (limited) return apiError(limited, 429, { "Retry-After": "60" });

  const b = parsed.body;
  return apiOk(
    await requestCustomQuote(
      {
        reg: b.reg,
        make: b.make,
        model: b.model,
        description: b.description,
        name: b.name,
        email: b.email,
        phone: b.phone,
        postcode: b.postcode,
      },
      caller ? { userId: caller.userId, email: caller.email } : null,
    ),
  );
}
