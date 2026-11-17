// The "Ask us for a quote" link (Task 75), carrying the car and what the
// customer searched for. Pure and import-free so the client search box can use it.

/** "AB12CDE, FORD Focus": the reg with the car, for quote pages and emails. */
export function describeQuoteVehicle(reg: string, make?: string | null, model?: string | null): string {
  const car = [make, model].filter(Boolean).join(" ").trim();
  return car ? `${reg}, ${car}` : reg;
}

export function quoteRequestHref(params: {
  reg: string;
  make?: string;
  model?: string;
  postcode?: string;
  q?: string;
  /** "parts": the repair is listed, but its parts are priced by hand (2026-11-17). */
  reason?: "parts";
}): string {
  const query = new URLSearchParams();
  if (params.reg) query.set("reg", params.reg);
  if (params.make) query.set("make", params.make);
  if (params.model) query.set("model", params.model);
  if (params.postcode) query.set("postcode", params.postcode);
  if (params.q?.trim()) query.set("q", params.q.trim().slice(0, 200));
  if (params.reason) query.set("for", params.reason);
  return `/book/quote/request?${query.toString()}`;
}
