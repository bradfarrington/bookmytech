// Which host the app is answering on decides whether search engines may index
// it. Over its life the same build runs on localhost, on Vercel's *.vercel.app
// deployment URLs, on the client-testing subdomain (bmt.thedigicraft.co.uk)
// and finally on bookmytech.co.uk. Only the last is the real site; every other
// copy must stay out of Google, or it turns up as a duplicate / "test site"
// result and outranks or confuses the launch.
//
// The rule is keyed on the hostname rather than an env flag so there is no
// switch to forget: the site becomes indexable the moment it is served from the
// production domain, and nowhere else ever is. (A future staging.bookmytech.co.uk
// would need excluding here explicitly.)

export const PRODUCTION_DOMAIN = "bookmytech.co.uk";

/**
 * True for the production domain and any subdomain of it (www., and the
 * planned mechanic./admin. splits), false for everything else. Accepts a raw
 * Host header value, so a port suffix is tolerated.
 */
export function isIndexableHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].trim().toLowerCase();
  return (
    hostname === PRODUCTION_DOMAIN || hostname.endsWith(`.${PRODUCTION_DOMAIN}`)
  );
}

/**
 * The same rule applied to the configured public origin (NEXT_PUBLIC_SITE_URL),
 * for the places that have no request to look at — the root metadata is one.
 * Unset or unparseable means "not production".
 */
export function isProductionSite(): boolean {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return false;
  try {
    return isIndexableHost(new URL(raw).host);
  } catch {
    return false;
  }
}
