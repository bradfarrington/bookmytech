import type { MetadataRoute } from "next";

// Served at /robots.txt (Next 16 metadata route — same mechanism as
// app/manifest.ts).
//
// Signed-in areas, tokened links and machine endpoints are never worth crawling
// on any host, so they are disallowed everywhere. Note the trailing slashes:
// robots rules are prefix matches, and a bare "/mechanic" would also hide the
// public /mechanics recruitment and area pages.
//
// This file deliberately does NOT say "Disallow: /" off the production domain.
// Keeping the site out of search results there is done with noindex (the
// X-Robots-Tag header in proxy.ts plus the root metadata in app/layout.tsx),
// and a crawler has to be allowed to fetch a page to see its noindex. A blanket
// Disallow would hide the instruction, and Google still lists URLs it is
// forbidden to read whenever something links to them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/mechanic/",
        "/dashboard/",
        "/api/",
        "/auth/",
        "/r/",
        "/mechanics/resubmit/",
      ],
    },
  };
}
