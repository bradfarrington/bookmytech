"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  // Receives the signed PNG. Should resolve when the upload (and anything that
  // follows it) is done; the pad shows a pending state until it does.
  onSave: (blob: Blob) => Promise<void> | void;
  saving?: boolean;
  saveLabel?: string;
}

// Lightweight canvas signature pad — pointer events, no dependency. Tracks the
// device pixel ratio so the line stays crisp, and remembers whether anything
// has been drawn so we don't submit a blank sign-off.
export function SignaturePad({ onSave, saving = false, saveLabel = "Confirm sign-off" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Size the backing store to the displayed size × DPR, then scale so we draw
  // in CSS pixels. Re-run on resize so the canvas reflows with the layout.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
    }

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointFromEvent(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    canvas.toBlob((blob) => {
      if (blob) void onSave(blob);
    }, "image/png");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        <PenLine size={12} />
        Customer signature
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded-button border border-border bg-white"
        aria-label="Signature pad"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconLeft={Eraser}
          onClick={clear}
          disabled={saving || !hasInk}
        >
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          onClick={confirm}
          disabled={saving || !hasInk}
        >
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        Hand the screen to the customer to sign, then confirm to complete and charge.
      </p>
    </div>
  );
}
