import { cn } from "@/lib/utils";

// Visual styling for each application status. Shared by the queue + detail.
export const STATUS_META: Record<string, { label: string; className: string }> = {
  submitted: { label: "Submitted", className: "bg-brand-blue/10 text-brand-blue" },
  under_review: { label: "Under review", className: "bg-warning/15 text-warning" },
  needs_info: { label: "Needs info", className: "bg-warning/15 text-warning" },
  approved: { label: "Approved", className: "bg-success/15 text-success" },
  approved_with_grace: { label: "Approved (grace)", className: "bg-success/15 text-success" },
  rejected: { label: "Rejected", className: "bg-danger/15 text-danger" },
};

export function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "bg-border-subtle text-text-muted" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
