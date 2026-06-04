import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto/encrypt";
import { runAutoScreen } from "@/lib/auto-screen/checks";
import { Overline } from "@/components/ui/overline";
import { ApprovalsQueue, type QueueItem } from "./_components/queue";
import { ApplicationDetail } from "./_components/detail";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  "submitted",
  "under_review",
  "needs_info",
  "approved",
  "rejected",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function safeDecrypt(blob: string | null): string | null {
  if (!blob) return null;
  try {
    return decrypt(blob);
  } catch {
    return null;
  }
}

export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; status?: string }>;
}) {
  const { id, status } = await searchParams;
  const activeFilter: StatusFilter | "all" =
    status && (STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as StatusFilter)
      : "all";

  const supabase = await createClient();

  // Queue — oldest first so the longest-waiting applicant surfaces top.
  let listQuery = supabase
    .from("mechanic_applications")
    .select("id, full_name, postcode, status, submitted_at")
    .order("submitted_at", { ascending: true });
  if (activeFilter !== "all") listQuery = listQuery.eq("status", activeFilter);
  const { data: listRaw } = await listQuery;
  const queue: QueueItem[] = (listRaw ?? []).map((a) => ({
    id: a.id,
    fullName: a.full_name,
    postcode: a.postcode,
    status: a.status,
    submittedAt: a.submitted_at,
  }));

  // Detail — full record for the selected application.
  let detail = null;
  if (id) {
    const { data: app } = await supabase
      .from("mechanic_applications")
      .select("*")
      .eq("id", id)
      .single();

    if (app) {
      const sortCode = safeDecrypt(app.bank_sort_code_encrypted);
      const accountNumber = safeDecrypt(app.bank_account_number_encrypted);

      // Storage object sizes for the < 5 MB insurance auto-screen rule.
      const sizes: Record<string, number> = {};
      const adminClient = createAdminClient();
      const { data: objects } = await adminClient.storage
        .from("mechanic-docs")
        .list(`applications/${app.id}`);
      for (const obj of objects ?? []) {
        const size = (obj.metadata as { size?: number } | null)?.size;
        if (typeof size === "number") sizes[`applications/${app.id}/${obj.name}`] = size;
      }

      const items = runAutoScreen({
        doc_photo_id: app.doc_photo_id,
        doc_public_liability_insurance: app.doc_public_liability_insurance,
        doc_trade_insurance: app.doc_trade_insurance,
        doc_qualification: app.doc_qualification,
        doc_vat: app.doc_vat,
        vat_registered: app.vat_registered,
        bankSortCode: sortCode,
        bankAccountNumber: accountNumber,
        reference_1_email: app.reference_1_email,
        reference_1_phone: app.reference_1_phone,
        reference_2_email: app.reference_2_email,
        reference_2_phone: app.reference_2_phone,
        sizes,
      });

      detail = { app, items, bank: { sortCode, accountNumber } };
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Overline>Network</Overline>
        <h1 className="text-2xl font-extrabold text-text-primary">Mechanic approvals</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Review applications, verify documents, and approve or reject mechanics.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <ApprovalsQueue
          items={queue}
          activeFilter={activeFilter}
          selectedId={id ?? null}
        />
        {detail ? (
          <ApplicationDetail
            app={detail.app}
            items={detail.items}
            bank={detail.bank}
          />
        ) : (
          <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-dashed border-border bg-surface-card p-8 text-center text-sm text-text-muted">
            {queue.length === 0
              ? "No applications match this filter."
              : "Select an application from the queue to review it."}
          </div>
        )}
      </div>
    </div>
  );
}
