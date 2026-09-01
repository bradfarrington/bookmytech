import "server-only";

// The two things the three vehicle-picker read routes share (Task 20).

/**
 * "We can't show you a list." Returned at 200, like every other negative answer
 * the app branches on (see `CatalogueFailure` in lib/haynespro/catalogue.ts) —
 * the request ran, HaynesPro just didn't answer with anything renderable.
 *
 * Deliberately NOT an empty list. HaynesPro always has ~89 makes and every model
 * has variants, so an empty cascade means an outage or an id we don't recognise;
 * rendering that as "this car has no variants" tells the customer something
 * false about their car and gives them nothing to do about it.
 */
export const PICKER_UNAVAILABLE = {
  ok: false as const,
  code: "unavailable" as const,
  message:
    "We can't load the vehicle list at the moment — that's a problem on our side. " +
    "Please try again a little later.",
};

/**
 * A positive integer query parameter, or null. HaynesPro ids are bare integers
 * (no `m_`/`t_` prefix), and a malformed one is a client bug, not a customer
 * one — the routes answer it with a 400 rather than spending an upstream call.
 */
export function readIdParam(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name)?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
