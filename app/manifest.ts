import type { MetadataRoute } from "next";

// Web app manifest via Next 16's built-in metadata route (app/manifest.ts) —
// served at /manifest.webmanifest and auto-linked into <head>. This is the
// idiomatic replacement for a hand-written public/manifest.json.
//
// The PWA is the mechanic's field tool, so it launches at /mechanic. The custom
// install banner (components/pwa/install-prompt.tsx) only appears in the
// mechanic area.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Book My Tech — Mechanic",
    short_name: "Book My Tech",
    description: "Manage your jobs, earnings and reviews on the go.",
    start_url: "/mechanic",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563EB",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
