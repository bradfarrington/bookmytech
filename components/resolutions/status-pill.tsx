import { cn } from "@/lib/utils";
import {
  RESOLUTION_STATUS_LABELS,
  RESOLUTION_STATUS_TONES,
  type ResolutionStatus,
} from "@/lib/resolutions/constants";

export function StatusPill({ status }: { status: ResolutionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        RESOLUTION_STATUS_TONES[status],
      )}
    >
      {RESOLUTION_STATUS_LABELS[status]}
    </span>
  );
}
