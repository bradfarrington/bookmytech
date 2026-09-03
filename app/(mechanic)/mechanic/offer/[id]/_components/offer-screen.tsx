"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap, Clock, MapPin, Wrench, Car, StickyNote, Check, X } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { acceptOffer, declineOffer } from "@/app/actions/job-offers";
import { useStayFresh } from "@/lib/use-stay-fresh";

interface OfferScreenProps {
  offerId: string;
  bookingId: string;
  mechanicId: string;
  serviceName: string;
  vehicle: string;
  reg: string | null;
  whenLabel: string;
  where: string;
  distanceLabel: string | null;
  notes: string | null;
  earningsPence: number;
}

const SWIPE_THRESHOLD = 120; // px of left-drag to trigger decline

export function OfferScreen(props: OfferScreenProps) {
  const { offerId, bookingId, serviceName, vehicle, reg, whenLabel, where, distanceLabel, notes, earningsPence } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // If another mechanic accepts (or the offer is withdrawn) while this screen is
  // open, polling re-runs the server component, which re-renders the "no longer
  // available" state. Time-sensitive, so it polls quickly. No Realtime needed.
  useStayFresh(() => router.refresh(), 8_000);

  function handleAccept() {
    startTransition(async () => {
      const res = await acceptOffer(offerId);
      if (res.ok) {
        // The job page opens with the arrival-window picker for an all-day job.
        toast.success(
          res.needsArrivalWindow
            ? "Job accepted — now pick an arrival window."
            : "Job accepted — it's yours.",
        );
        router.push(`/mechanic/jobs/${res.bookingId ?? bookingId}`);
      } else {
        toast.error(res.error);
        router.refresh();
      }
    });
  }

  function handleDecline() {
    startTransition(async () => {
      const res = await declineOffer(offerId);
      if (!res.ok) toast.error(res.error);
      router.push("/mechanic/jobs");
    });
  }

  // --- Swipe-to-decline ------------------------------------------------------
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (pending) return;
    startX.current = e.clientX;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startX.current === null) return;
    setDragX(Math.min(0, e.clientX - startX.current)); // left-only
  }
  function onPointerUp() {
    if (startX.current === null) return;
    const dropped = dragX <= -SWIPE_THRESHOLD;
    startX.current = null;
    setDragX(0);
    if (dropped) handleDecline();
  }

  const swipeProgress = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);

  return (
    <div className="flex flex-1 flex-col">
      {/* Urgency bar — first-to-accept, no countdown */}
      <div className="mx-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-800">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
        </span>
        <Zap size={15} className="shrink-0" />
        First to accept wins — be quick.
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Earnings highlight */}
        <div className="rounded-2xl bg-gradient-to-br from-brand-blue to-blue-700 p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-100">You earn</p>
          <p className="mt-1 text-5xl font-extrabold tracking-tight">{formatPrice(earningsPence)}</p>
          <p className="mt-1 text-sm text-blue-100">Paid out 24h after you complete the job.</p>
        </div>

        {/* Info tiles */}
        <div className="grid grid-cols-2 gap-3">
          <Tile icon={Clock} label="When" value={whenLabel} />
          <Tile icon={MapPin} label="Where" value={distanceLabel ? `${where} · ${distanceLabel}` : where} />
          <Tile icon={Wrench} label="Service" value={serviceName} />
          <Tile icon={Car} label="Vehicle" value={reg ? `${vehicle} · ${reg}` : vehicle} />
        </div>

        {/* Customer notes */}
        {notes && (
          <div className="rounded-2xl border border-border bg-surface-card p-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              <StickyNote size={12} />
              Customer notes
            </div>
            <p className="line-clamp-4 text-sm leading-relaxed text-text-secondary">{notes}</p>
          </div>
        )}
      </div>

      {/* Actions — large, thumb-reachable, sticky at the bottom */}
      <div className="sticky bottom-0 space-y-2.5 border-t border-border bg-surface-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleAccept}
          disabled={pending}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-button bg-brand-blue text-base font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-60"
        >
          <Check size={20} />
          {pending ? "Working…" : "Accept job"}
        </button>

        {/* Swipe-to-decline (with a tappable fallback) */}
        <div className="relative overflow-hidden rounded-button">
          <div
            className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-red-600"
            style={{ opacity: swipeProgress }}
          >
            Release to decline
          </div>
          <button
            type="button"
            onClick={handleDecline}
            disabled={pending}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ transform: `translateX(${dragX}px)`, touchAction: "pan-y" }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-button border border-border bg-surface text-sm font-semibold text-text-secondary transition-colors hover:bg-border-subtle disabled:opacity-60"
          >
            <X size={16} />
            Decline <span className="text-text-muted">· or swipe left</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-card p-3.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        <Icon size={12} />
        {label}
      </div>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}
