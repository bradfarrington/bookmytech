"use client";

import { useEffect } from "react";

// Last-resort boundary: catches errors thrown by the ROOT layout itself, which
// no error.tsx can reach. When it renders it REPLACES app/layout.tsx, so it has
// to bring its own <html> and <body> — and it cannot rely on anything the root
// layout normally provides.
//
// That means no Inter (next/font is set up in the layout this is replacing), no
// design tokens (globals.css is imported there too), and no shared components
// that might assume either. Hence the inline styles and the system font stack:
// the one screen that must never itself fail to render is the one that renders
// when everything else has.
//
// metadata/generateMetadata aren't supported in a Client Component, so the tab
// title is set with React 19's <title>.

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global] root layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>Something went wrong — Book My Tech</title>

        <main style={{ maxWidth: "420px", textAlign: "center" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              margin: "0 auto 20px",
              borderRadius: "9999px",
              backgroundColor: "#fef2f2",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              lineHeight: 1,
            }}
            aria-hidden
          >
            !
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: "15px",
              lineHeight: 1.6,
              color: "#475569",
            }}
          >
            Book My Tech hit an unexpected problem. Nothing you&apos;ve booked is
            affected — this is a display error on our side.
          </p>

          <div
            style={{
              marginTop: "28px",
              display: "flex",
              gap: "10px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                height: "40px",
                padding: "0 16px",
                borderRadius: "10px",
                border: "1px solid transparent",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Deliberately a plain <a>, not next/link: this boundary renders when
                the ROOT layout has failed, so a client-side navigation would
                re-enter the same broken tree. A hard document load is the only
                reliable way out. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                height: "40px",
                padding: "0 16px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                color: "#334155",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Back to home
            </a>
          </div>

          <p style={{ margin: "28px 0 0", fontSize: "14px", color: "#64748b" }}>
            Still stuck?{" "}
            <a
              href="mailto:support@bookmytech.co.uk"
              style={{ color: "#2563eb", fontWeight: 600 }}
            >
              support@bookmytech.co.uk
            </a>
          </p>

          {error.digest && (
            <p style={{ margin: "12px 0 0", fontSize: "12px", color: "#64748b" }}>
              Reference <code style={{ fontFamily: "monospace" }}>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
