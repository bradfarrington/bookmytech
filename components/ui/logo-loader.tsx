import Image from "next/image";

// Our logo, animated, for while the repair list waits on live part prices
// (Brad, 2026-11-18: "an animated version of our logo cube with man whilst
// prices are being fetched"). A blue line traces the hexagon round the
// mechanic, who breathes gently. Still under prefers-reduced-motion. No
// directive: server and client components both render it.

export function LogoLoader({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface-card px-4 py-12 shadow-card">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <polygon
            points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
            className="text-brand-blue/15"
          />
          <polygon
            points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="70 230"
            className="text-brand-blue animate-[logo-trace_1.6s_linear_infinite] motion-reduce:animate-none"
          />
        </svg>
        <Image
          src="/favicon.png"
          alt=""
          width={150}
          height={150}
          priority
          className="absolute inset-[14%] h-[72%] w-[72%] animate-[logo-breathe_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
        />
      </div>
      <p className="text-center text-sm font-semibold text-text-secondary">{label}</p>
    </div>
  );
}
