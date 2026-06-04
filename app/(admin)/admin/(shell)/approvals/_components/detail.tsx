import { Card } from "@/components/ui/card";
import { maskTail } from "@/lib/crypto/encrypt";
import { summarise, type ChecklistItemResult } from "@/lib/auto-screen/checks";
import { StatusPill } from "./status-pill";
import { VerificationChecklist } from "./verification-checklist";
import { DetailActions } from "./detail-actions";

// `app` is the full mechanic_applications row. Typed loosely — it's a wide
// table and this is the only consumer.
type Application = Record<string, any>;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="text-sm font-medium text-text-primary">{value || "—"}</dd>
    </div>
  );
}

function Reference({ n, app }: { n: 1 | 2; app: Application }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-sm font-semibold text-text-primary">
        {app[`reference_${n}_name`] || "—"}
        {app[`reference_${n}_relationship`] && (
          <span className="font-normal text-text-muted"> · {app[`reference_${n}_relationship`]}</span>
        )}
      </p>
      <p className="text-xs text-text-secondary">
        {app[`reference_${n}_email`] || "—"} · {app[`reference_${n}_phone`] || "—"}
      </p>
    </div>
  );
}

export function ApplicationDetail({
  app,
  items,
  bank,
}: {
  app: Application;
  items: ChecklistItemResult[];
  bank: { sortCode: string | null; accountNumber: string | null };
}) {
  const summary = summarise(items);
  const decided = app.status === "approved" || app.status === "approved_with_grace" || app.status === "rejected";
  const businessType =
    app.business_type === "limited_company"
      ? "Limited company"
      : app.business_type === "sole_trader"
        ? "Sole trader"
        : "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-text-primary">{app.full_name}</h2>
            <p className="text-sm text-text-secondary">
              {app.email} · {app.phone}
            </p>
          </div>
          <StatusPill status={app.status} />
        </div>

        {app.status === "approved_with_grace" && app.grace_period_ends_at && (
          <p className="rounded-button bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            Approved with grace — outstanding documents due by{" "}
            {new Date(app.grace_period_ends_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
        )}
        {app.status === "rejected" && app.rejection_reason && (
          <p className="rounded-button bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
            Rejected: {app.rejection_reason}
          </p>
        )}
        {app.status === "needs_info" && app.needs_info_note && (
          <p className="rounded-button bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            Awaiting applicant: {app.needs_info_note}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Postcode" value={app.postcode} />
          <Field
            label="Experience"
            value={app.years_experience ? `${app.years_experience} yrs` : "—"}
          />
          <Field label="Service radius" value={`${app.service_radius_miles} miles`} />
          <Field label="Business type" value={businessType} />
          <Field label="Business name" value={app.business_name} />
          <Field
            label={app.business_type === "limited_company" ? "Company no." : "UTR"}
            value={app.business_number}
          />
          <Field label="VAT registered" value={app.vat_registered ? "Yes" : "No"} />
          <Field
            label="Bank (sort / account)"
            value={
              bank.sortCode && bank.accountNumber
                ? `${maskTail(bank.sortCode, 2)} / ${maskTail(bank.accountNumber)}`
                : "—"
            }
          />
        </dl>

        {app.specialisms?.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-muted">Specialisms</p>
            <div className="flex flex-wrap gap-1.5">
              {app.specialisms.map((s: string) => (
                <span
                  key={s}
                  className="rounded-full bg-border-subtle px-2.5 py-0.5 text-xs font-medium text-text-secondary"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Verification checklist */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">Verification checklist</h3>
          <p className="text-xs text-text-muted">
            {summary.autoVerified} of {summary.total} auto-verified
            {summary.needManual > 0 && ` · ${summary.needManual} need manual review`}
          </p>
        </div>
        <VerificationChecklist
          applicationId={app.id}
          items={items}
          verification={(app.verification as Record<string, boolean>) ?? {}}
          readOnly={decided}
        />
      </Card>

      {/* References */}
      <Card className="space-y-3">
        <h3 className="text-sm font-bold text-text-primary">Professional references</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Reference n={1} app={app} />
          <Reference n={2} app={app} />
        </div>
      </Card>

      {/* Actions */}
      <Card>
        <DetailActions applicationId={app.id} decided={decided} />
      </Card>
    </div>
  );
}
