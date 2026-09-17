"use server";

import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { deleteJobPhotoFor, uploadJobPhotoFor } from "@/lib/mechanics/job-media";

export type JobMediaResult =
  | { ok: true; url?: string }
  | { ok: false; error: string };

// Mechanic-captured job evidence — photos of the work. The work lives in
// lib/mechanics/job-media.ts, shared with the mechanic app's route handlers
// (Task 67); these actions only resolve the mechanic from the cookie session.

/** Upload one job photo. Allowed while the job is confirmed / en route / in progress. */
export async function uploadJobPhoto(
  bookingId: string,
  formData: FormData,
): Promise<JobMediaResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const result = await uploadJobPhotoFor(guard.mechanicId, bookingId, formData.get("file"));
  return result.ok ? { ok: true, url: result.url } : { ok: false, error: result.error };
}

/** Remove a job photo the mechanic uploaded. */
export async function deleteJobPhoto(mediaId: string): Promise<JobMediaResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const result = await deleteJobPhotoFor(guard.mechanicId, mediaId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
