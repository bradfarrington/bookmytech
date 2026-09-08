"use server";

import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { addFault, deleteFault } from "@/lib/quotes/mechanic";

// Faults the mechanic notes on the job (Task 33).

export async function addFaultAction(input: { bookingId: string; description: string; severity?: string }) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return addFault(guard.mechanicId, input);
}

export async function deleteFaultAction(faultId: string) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return deleteFault(guard.mechanicId, faultId);
}
