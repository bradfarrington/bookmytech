"use client";

import { useRef } from "react";
import { Car, Check, ShieldCheck } from "lucide-react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Stars } from "@/components/ui/stars";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

// Mechanics shown scattered around the radar. The first is the one that
// "accepts" in the animation — the customer never chooses; the job is
// broadcast to everyone nearby and the first to accept wins.
type NearbyMechanic = { name: string; tint: number; top: string; left: string };

const NEARBY: NearbyMechanic[] = [
  { name: "James M.", tint: 4, top: "8%", left: "12%" },
  { name: "Priya S.", tint: 1, top: "14%", left: "66%" },
  { name: "Tom W.", tint: 2, top: "60%", left: "6%" },
  { name: "Dani R.", tint: 0, top: "68%", left: "62%" },
  { name: "Owen B.", tint: 3, top: "38%", left: "82%" },
];

export function LiveDispatchCard() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Static, honest end-state for reduced motion / no animation: job
      // broadcast, first mechanic accepted.
      if (reduce) {
        gsap.set(".bmt-chip", { opacity: 1, scale: 1 });
        gsap.set(".bmt-chip--other", { opacity: 0.4 });
        gsap.set(".bmt-accept-ring, .bmt-check", { opacity: 1, scale: 1 });
        gsap.set(".bmt-status-broadcast", { opacity: 0 });
        gsap.set(".bmt-status-accepted, .bmt-banner", { opacity: 1, y: 0 });
        return;
      }

      // Radar pulse rings emanate from the centre continuously.
      gsap.fromTo(
        ".bmt-ring",
        { scale: 0.2, opacity: 0.45 },
        {
          scale: 1,
          opacity: 0,
          duration: 2.6,
          ease: "power1.out",
          repeat: -1,
          stagger: { each: 0.85, repeat: -1 },
        },
      );

      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 1,
        defaults: { ease: "power3.out" },
      });

      tl
        // ── reset ──
        .set(".bmt-chip", { opacity: 0, scale: 0.5 })
        .set(".bmt-chip--other", { filter: "grayscale(0)" })
        .set(".bmt-accept-ring, .bmt-check", { opacity: 0, scale: 0.4 })
        .set(".bmt-banner", { opacity: 0, y: 14 })
        .set(".bmt-status-broadcast", { opacity: 1 })
        .set(".bmt-status-accepted", { opacity: 0 })
        // ── broadcast: mechanics light up nearby ──
        .to(".bmt-chip", {
          opacity: 1,
          scale: 1,
          duration: 0.45,
          stagger: 0.12,
        })
        .to({}, { duration: 1 })
        // ── first to accept wins: others dim, accepted one is confirmed ──
        .to(".bmt-chip--other", {
          opacity: 0.3,
          scale: 0.82,
          filter: "grayscale(1)",
          duration: 0.45,
        })
        .to(
          ".bmt-chip--accepted",
          { scale: 1.12, duration: 0.45 },
          "<",
        )
        .to(
          ".bmt-accept-ring",
          { opacity: 1, scale: 1, duration: 0.4 },
          "<",
        )
        .to(
          ".bmt-check",
          { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" },
          "-=0.1",
        )
        // ── swap the status line and reveal the confirmation banner ──
        .to(".bmt-status-broadcast", { opacity: 0, duration: 0.25 }, "-=0.2")
        .to(".bmt-status-accepted", { opacity: 1, duration: 0.25 }, "<")
        .to(".bmt-banner", { opacity: 1, y: 0, duration: 0.5 }, "-=0.1")
        .to({}, { duration: 1.8 })
        // ── ease everything out before the loop restarts ──
        .to([".bmt-banner", ".bmt-status-accepted"], {
          opacity: 0,
          duration: 0.3,
        });
    },
    { scope: ref },
  );

  return (
    <Card
      padded={false}
      className="w-full max-w-[420px] overflow-hidden border-0 shadow-hero"
    >
      <div ref={ref}>
        <header className="flex items-center justify-between gap-2.5 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-success" />
            </span>
            <p className="text-sm font-bold text-text-primary">
              Live dispatch
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted">
            <Icon icon={ShieldCheck} size={13} className="text-brand-blue" />
            Vetted &amp; insured
          </span>
        </header>

        {/* Radar: your car at the centre, mechanics scattered nearby. */}
        <div className="relative h-[244px] overflow-hidden bg-surface">
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-[244px] -translate-x-1/2 -translate-y-1/2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="bmt-ring absolute inset-0 rounded-full border-[1.5px] border-brand-blue/40"
              />
            ))}
          </div>

          {/* Centre node — the customer's car / location. */}
          <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
            <span className="flex size-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-hero ring-4 ring-white">
              <Icon icon={Car} size={24} />
            </span>
            <span className="rounded-full bg-text-primary px-2 py-0.5 text-[10px] font-bold text-white">
              Your car
            </span>
          </div>

          {/* Nearby mechanics. */}
          {NEARBY.map((m, i) => {
            const accepted = i === 0;
            return (
              <div
                key={m.name}
                style={{ top: m.top, left: m.left }}
                className={cn(
                  "bmt-chip absolute flex items-center gap-1.5 rounded-full border bg-surface-card py-1 pl-1 pr-2.5 shadow-card",
                  accepted
                    ? "bmt-chip--accepted z-20 border-success"
                    : "bmt-chip--other border-border",
                )}
              >
                <span className="relative">
                  <Avatar name={m.name} tint={m.tint} size={26} />
                  {accepted && (
                    <>
                      <span className="bmt-accept-ring absolute -inset-[3px] rounded-full ring-2 ring-success" />
                      <span className="bmt-check absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-success ring-2 ring-surface-card">
                        <Icon icon={Check} size={9} className="text-white" />
                      </span>
                    </>
                  )}
                </span>
                <span className="text-[11px] font-bold text-text-primary">
                  {m.name}
                </span>
              </div>
            );
          })}

          {/* Status line, crossfading from "broadcasting" to "accepted". */}
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="relative">
              <span className="bmt-status-broadcast inline-flex items-center gap-1.5 rounded-full bg-brand-blue/10 px-3 py-1 text-[11px] font-semibold text-brand-blue">
                Broadcasting to 8 mechanics nearby…
              </span>
              <span className="bmt-status-accepted absolute inset-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-success/15 px-3 py-1 text-[11px] font-semibold text-green-700">
                <Icon icon={Check} size={12} /> James M. accepted your job
              </span>
            </div>
          </div>
        </div>

        {/* Confirmation banner — who's coming, when, and the fixed price. */}
        <footer className="border-t border-border px-5 py-4">
          <div className="bmt-banner flex items-center gap-3">
            <Avatar name="James M." tint={4} size={42} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-text-primary">
                James M. is on the way
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <Stars value={5} size={10} />
                <span>4.9 · ETA today, 14:00</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold tracking-tight text-text-primary">
                £89
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-muted">
                Fixed price
              </p>
            </div>
          </div>
        </footer>
      </div>
    </Card>
  );
}
