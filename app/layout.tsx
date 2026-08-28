import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { isProductionSite } from "@/lib/site";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Book My Tech — Mobile mechanics, booked in 60 seconds",
  description:
    "Vetted mobile mechanics. Transparent pricing. Pay only when the job is done.",
  applicationName: "Book My Tech",
  // <link rel="manifest"> is injected automatically from app/manifest.ts.
  icons: {
    icon: "/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Book My Tech",
    statusBarStyle: "default",
  },
  // Off the production domain (localhost, Vercel URLs, the client-testing
  // subdomain) every page carries <meta name="robots" content="noindex">.
  // This mirrors the X-Robots-Tag header proxy.ts sets for anything that reads
  // the page rather than the response headers. Pages that set their own
  // `robots` (not-found) override this key; none of them re-enable indexing.
  ...(isProductionSite() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  // Let content extend under the notch / home indicator so env(safe-area-inset-*)
  // padding (used in the mechanic shell + nav drawer) takes effect.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
