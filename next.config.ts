import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      // The packaged-services catalogue is gone (Task 17): every booking is a
      // HaynesPro repair. Keep old links (emails, bookmarks, in-flight
      // sessions) landing somewhere sensible. Query strings pass through, so
      // an old /book/service?reg=… link keeps its reg.
      { source: "/book/service", destination: "/book/repairs", permanent: true },
      { source: "/services", destination: "/book", permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      // Uploads (onboarding docs, job photos, avatars) go through Server Actions.
      // Next.js caps Server Action request bodies at 1MB by default, which rejects
      // a normal photo/PDF before our own 10MB per-file validation can run. Lift it
      // above the largest per-file limit (10MB docs/photos) plus multipart overhead.
      bodySizeLimit: "15mb",
    },
  },
  async headers() {
    return [
      // Baseline security headers, applied everywhere.
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // The service worker must always be served fresh and as JavaScript, so a
      // stale SW never gets pinned in the HTTP cache.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
