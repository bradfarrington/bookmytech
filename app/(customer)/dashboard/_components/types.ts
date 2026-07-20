// Plain, serialisable shapes shared between the dashboard server page and its
// client components.

import { formatBookingSlot } from "@/lib/slots";

export interface DashboardBooking {
  id: string;
  status: string;
  scheduledAt: string | null;
  slotWindow: string | null;
  createdAt: string | null;
  completedAt: string | null;
  totalPence: number;
  vehicleReg: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  addressLine1: string | null;
  postcode: string | null;
  mechanicId: string | null;
  rescheduleStatus: string | null;
  rescheduleProposedAt: string | null;
  rescheduleNote: string | null;
  repairDescription: string;
  repairNodeId: string | null;
}

export interface MechanicLite {
  id: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  rating: number | null;
}

export const STATUS_LABELS: Record<string, string> = {
  sourcing_mechanic: "Finding mechanic",
  confirmed: "Confirmed",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Complete",
  cancelled: "Cancelled",
  disputed: "Under review",
};

// Tailwind classes for the status pill, by status.
export const STATUS_TONES: Record<string, string> = {
  sourcing_mechanic: "bg-blue-50 text-brand-blue",
  confirmed: "bg-blue-50 text-brand-blue",
  en_route: "bg-amber-50 text-amber-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-green-50 text-success",
  cancelled: "bg-red-50 text-red-600",
  disputed: "bg-amber-50 text-amber-800",
};

export function formatSlot(iso: string | null, window?: string | null): string {
  return formatBookingSlot(iso, window);
}
