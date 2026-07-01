"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { saveResolutionReason, deleteResolutionReason } from "@/app/actions/resolutions";

export interface ReasonRow {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

const FIELD =
  "rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

export function ReasonsEditor({ initialReasons }: { initialReasons: ReasonRow[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {initialReasons.length === 0 && (
          <p className="text-sm text-text-muted">No reasons yet — add the first one below.</p>
        )}
        {initialReasons.map((r) => (
          <ReasonCard key={r.id} reason={r} />
        ))}
      </div>
      <NewReason nextOrder={(initialReasons.at(-1)?.sortOrder ?? 0) + 10} />
    </div>
  );
}

function ReasonCard({ reason }: { reason: ReasonRow }) {
  const router = useRouter();
  const [label, setLabel] = useState(reason.label);
  const [active, setActive] = useState(reason.active);
  const [sortOrder, setSortOrder] = useState(reason.sortOrder);
  const [pending, start] = useTransition();

  const dirty = label !== reason.label || active !== reason.active || sortOrder !== reason.sortOrder;

  function save() {
    start(async () => {
      const res = await saveResolutionReason({ id: reason.id, label, active, sortOrder });
      if (res.ok) {
        toast.success("Reason saved.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function deactivate() {
    start(async () => {
      const res = await deleteResolutionReason(reason.id);
      if (res.ok) {
        toast.success("Reason hidden from the dropdown.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-2xl border border-border bg-surface-card p-3",
        !active && "opacity-60",
      )}
    >
      <input
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(Number(e.target.value))}
        aria-label="Sort order"
        className={cn(FIELD, "w-16 text-center")}
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Reason label"
        className={cn(FIELD, "flex-1")}
      />
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="size-4 accent-brand-blue"
        />
        Active
      </label>
      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty || !label.trim()}
        className="inline-flex h-9 items-center gap-1.5 rounded-button bg-brand-blue px-3 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Save
      </button>
      {active && (
        <button
          type="button"
          onClick={deactivate}
          disabled={pending}
          className="rounded-button border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-surface disabled:opacity-50"
        >
          Hide
        </button>
      )}
    </div>
  );
}

function NewReason({ nextOrder }: { nextOrder: number }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!label.trim()) return;
    start(async () => {
      const res = await saveResolutionReason({ label, active: true, sortOrder: nextOrder });
      if (res.ok) {
        toast.success("Reason added.");
        setLabel("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-3">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Add a new reason…"
        className={cn(FIELD, "flex-1")}
      />
      <button
        type="button"
        onClick={add}
        disabled={pending || !label.trim()}
        className="inline-flex h-9 items-center gap-1.5 rounded-button bg-text-primary px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Add
      </button>
    </div>
  );
}
