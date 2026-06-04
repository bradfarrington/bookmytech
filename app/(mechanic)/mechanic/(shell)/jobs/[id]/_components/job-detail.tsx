import Link from "next/link";
import {
  ArrowLeft,
  Car,
  MapPin,
  CalendarClock,
  Clock,
  Route,
  Wallet,
  User,
  Phone,
  Lock,
  StickyNote,
  MessageSquare,
  ImageIcon,
  PenLine,
  Package,
  Sparkles,
  ListChecks,
  Settings2,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Overline } from "@/components/ui/overline";
import { formatPrice } from "@/lib/utils";
import { Timeline, type TimelineEvent } from "@/app/(admin)/admin/(shell)/jobs/[id]/_components/timeline";
import { EarningsBreakdown } from "./earnings-breakdown";
import { JobActions } from "./job-actions";
import { PhotoUploader, type JobPhoto } from "./photo-uploader";
import { PartsOrder, type JobPart } from "./parts-order";

export interface JobDetailProps {
  bookingId: string;
  status: string;
  ref: string; // short id
  createdAt: string | null;
  serviceName: string;
  vehicle: string; // "VW Golf"
  reg: string | null;
  whenLabel: string;
  distanceLabel: string;
  durationLabel: string;
  earningsPence: number;
  // Customer
  customerName: string;
  customerPhone: string | null;
  phoneRevealed: boolean; // status en_route / in_progress
  specialInstructions: string | null;
  address: string;
  // Earnings
  totalPence: number;
  commissionRate: number;
  // Parts
  parts: JobPart[];
  partsPence: number;
  bmtPartsPence: number;
  // Match reasons
  matchReasons: Array<{ label: string; detail: string }>;
  // Lifecycle
  cancellationReason: string | null;
  rescheduleStatus: string | null;
  rescheduleProposedAt: string | null;
  scheduledAt: string | null;
  events: TimelineEvent[];
  // Job evidence (mechanic-captured)
  photos: JobPhoto[];
  signatureUrl: string | null;
  hasSignature: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  sourcing_mechanic: "Sourcing mechanic",
  confirmed: "Confirmed",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

function statusTone(status: string): "active" | "success" | "pending" | "error" | "neutral" {
  if (["confirmed", "en_route", "in_progress"].includes(status)) return "active";
  if (status === "completed") return "success";
  if (status === "sourcing_mechanic") return "pending";
  if (status === "disputed") return "error";
  return "neutral";
}

export function JobDetail(props: JobDetailProps) {
  const {
    bookingId,
    status,
    serviceName,
    vehicle,
    reg,
    customerName,
    customerPhone,
    phoneRevealed,
    specialInstructions,
    address,
    matchReasons,
    cancellationReason,
    events,
    photos,
    signatureUrl,
    hasSignature,
  } = props;

  const canEditPhotos = ["confirmed", "en_route", "in_progress"].includes(status);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/mechanic/jobs">
        <Button variant="ghost" size="sm" iconLeft={ArrowLeft}>
          Back to jobs
        </Button>
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Overline>Job detail</Overline>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {serviceName}
            </h1>
            <Pill tone={statusTone(status)}>{STATUS_LABEL[status] ?? status}</Pill>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
            <Car size={14} className="text-text-muted" />
            <span className="font-medium text-text-secondary">{vehicle}</span>
            {reg && (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono font-semibold uppercase tracking-wide text-text-secondary">
                  {reg}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
            You earn
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-text-primary">
            {formatPrice(props.earningsPence)}
          </div>
        </div>
      </header>

      {/* Cancellation banner */}
      {status === "cancelled" && cancellationReason && (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            Cancellation reason
          </p>
          <p className="mt-1 text-sm text-red-800">{cancellationReason}</p>
        </Card>
      )}

      {/* Info tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InfoTile icon={CalendarClock} label="When" value={props.whenLabel} />
        <InfoTile icon={Route} label="Distance" value={props.distanceLabel} />
        <InfoTile icon={Clock} label="Estimated time" value={props.durationLabel} />
        <InfoTile icon={Wallet} label="You earn" value={formatPrice(props.earningsPence)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Customer */}
          <Card className="space-y-4 p-6">
            <CardTitle icon={User}>Customer</CardTitle>
            <Row icon={User} label="Name" value={customerName || "—"} />
            <Row icon={MapPin} label="Address" value={address || "—"} />
            <div className="flex items-start gap-3">
              <Phone size={16} className="mt-1 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                  Phone
                </p>
                {phoneRevealed ? (
                  <p className="text-sm font-semibold text-text-primary">
                    {customerPhone || "Not provided"}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-text-muted">
                    <Lock size={13} />
                    Revealed once you&apos;re en route
                  </p>
                )}
              </div>
            </div>
            {["confirmed", "en_route", "in_progress"].includes(status) && (
              <Link href={`/mechanic/jobs/${bookingId}/messages`}>
                <Button variant="secondary" size="sm" iconLeft={MessageSquare} fullWidth>
                  Message customer
                </Button>
              </Link>
            )}
          </Card>

          {/* Customer notes */}
          <Card className="space-y-3 p-6">
            <CardTitle icon={StickyNote}>Customer notes</CardTitle>
            {specialInstructions ? (
              <p className="rounded-lg bg-surface px-3.5 py-3 text-sm text-text-secondary">
                {specialInstructions}
              </p>
            ) : (
              <p className="text-sm text-text-muted">No notes left for this job.</p>
            )}
          </Card>

          {/* Job photos — mechanic-captured evidence of the work */}
          <Card className="space-y-3 p-6">
            <CardTitle icon={ImageIcon}>Job photos</CardTitle>
            <PhotoUploader bookingId={bookingId} photos={photos} canEdit={canEditPhotos} />
            {canEditPhotos && (
              <p className="text-xs text-text-muted">
                Snap before/after shots or any issues you spot. Visible to the
                customer and our team.
              </p>
            )}
          </Card>

          {/* Sign-off — the captured customer signature, once the job is done */}
          {signatureUrl && (
            <Card className="space-y-3 p-6">
              <CardTitle icon={PenLine}>Customer sign-off</CardTitle>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="Customer signature"
                className="h-32 w-full rounded-xl border border-border bg-white object-contain"
              />
            </Card>
          )}

          {/* Parts — placeholder until the parts system (Task 10) */}
          <Card className="space-y-3 p-6">
            <CardTitle icon={Package}>Parts allocated</CardTitle>
            <p className="text-sm text-text-muted">
              No parts allocated yet. Parts sourcing &amp; supplier costs land with
              the parts system in a later task.
            </p>
          </Card>

          {/* Timeline */}
          <Card className="space-y-4 p-6">
            <CardTitle icon={ListChecks}>Timeline</CardTitle>
            <Timeline events={events} />
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {/* Earnings breakdown */}
          <Card className="space-y-4 p-6">
            <CardTitle icon={Receipt}>Earnings breakdown</CardTitle>
            <EarningsBreakdown
              totalPence={props.totalPence}
              commissionRate={props.commissionRate}
              partsPence={props.partsPence}
              bmtPartsPence={props.bmtPartsPence}
            />
          </Card>

          {/* Parts */}
          {props.parts.length > 0 && (
            <Card className="space-y-4 p-6">
              <CardTitle icon={Package}>Parts</CardTitle>
              <PartsOrder parts={props.parts} canEdit={canEditPhotos} />
            </Card>
          )}

          {/* Why you're a great match */}
          <Card className="space-y-3 p-6">
            <CardTitle icon={Sparkles}>Why you&apos;re a great match</CardTitle>
            <ul className="space-y-2.5">
              {matchReasons.map((r) => (
                <li key={r.label} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text-primary">
                      {r.label}
                    </span>
                    <span className="block text-xs text-text-muted">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Actions */}
          <Card className="space-y-4 p-6">
            <CardTitle icon={Settings2}>Actions</CardTitle>
            <JobActions
              bookingId={bookingId}
              status={status}
              scheduledAt={props.scheduledAt}
              rescheduleStatus={props.rescheduleStatus}
              rescheduleProposedAt={props.rescheduleProposedAt}
              hasSignature={hasSignature}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function CardTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text-muted">
      <Icon size={14} />
      {children}
    </h2>
  );
}

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-1 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          {label}
        </p>
        <p className="break-words text-sm font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        <Icon size={13} />
        {label}
      </div>
      <p className="mt-1.5 text-sm font-bold text-text-primary">{value}</p>
    </Card>
  );
}
