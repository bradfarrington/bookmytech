"use client";

import { useState, useTransition } from "react";
import { Check, CircleAlert, CircleDashed, ExternalLink, Loader2, Minus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ChecklistItemResult } from "@/lib/auto-screen/checks";
import { getDocumentUrl, toggleVerification } from "@/app/actions/approvals";

interface Props {
  applicationId: string;
  items: ChecklistItemResult[];
  verification: Record<string, boolean>;
  /** Locked once the application is decided (approved/rejected). */
  readOnly: boolean;
}

export function VerificationChecklist({ applicationId, items, verification, readOnly }: Props) {
  const [verified, setVerified] = useState<Record<string, boolean>>(verification);
  const [opening, setOpening] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function openDoc(docColumn: string) {
    setOpening(docColumn);
    const result = await getDocumentUrl(applicationId, docColumn);
    setOpening(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }

  function toggle(key: string) {
    const next = !verified[key];
    setVerified((prev) => ({ ...prev, [key]: next }));
    startTransition(async () => {
      const result = await toggleVerification(applicationId, key, next);
      if (!result.ok) {
        setVerified((prev) => ({ ...prev, [key]: !next })); // revert
        toast.error(result.error);
      }
    });
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {items.map((item) => {
        const isVerified = !!verified[item.key];
        const na = item.verdict === "na";
        return (
          <li key={item.key} className="flex items-start gap-3 py-3">
            <span className="mt-0.5">
              {na ? (
                <Minus className="size-5 text-text-disabled" />
              ) : isVerified || item.verdict === "pass" ? (
                <Check className="size-5 text-success" />
              ) : item.verdict === "fail" ? (
                <CircleAlert className="size-5 text-danger" />
              ) : (
                <CircleDashed className="size-5 text-warning" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary">{item.label}</p>
              <p className="text-xs text-text-muted">
                {isVerified ? "Manually verified by admin." : item.note}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {item.docColumn && (
                <button
                  type="button"
                  onClick={() => openDoc(item.docColumn!)}
                  disabled={!!opening || item.verdict === "fail"}
                  className="inline-flex items-center gap-1 rounded-button border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary hover:border-brand-blue hover:text-brand-blue disabled:opacity-40"
                >
                  {opening === item.docColumn ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="size-3.5" />
                  )}
                  View
                </button>
              )}
              {!na && !readOnly && (
                <button
                  type="button"
                  onClick={() => toggle(item.key)}
                  className={cn(
                    "rounded-button px-2.5 py-1 text-xs font-semibold",
                    isVerified
                      ? "bg-success/15 text-success"
                      : "border border-border text-text-secondary hover:border-success hover:text-success",
                  )}
                >
                  {isVerified ? "Verified" : "Mark verified"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
