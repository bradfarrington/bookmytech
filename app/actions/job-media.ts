"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type JobMediaResult =
  | { ok: true; url?: string }
  | { ok: false; error: string };

// Mechanic-captured job evidence — photos + a sign-off signature — for the
// responsive desktop job view (delivered ahead of the mobile PWA). Same trust
// model as job-progress.ts: verify the caller owns the job in an RLS-aware
// client, then write the Storage object + booking_media row via service-role.

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
// Photos can be taken before and during the visit; the signature is part of
// completing the job.
const PHOTO_STATUSES = ["confirmed", "en_route", "in_progress"];

async function requireMechanic() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "mechanic")
    return { ok: false as const, error: "Mechanics only." };
  return { ok: true as const, mechanicId: user.id };
}

// Re-read the booking under service-role and confirm the caller owns it.
async function ownedBooking(bookingId: string, mechanicId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id")
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false as const, error: "That job no longer exists." };
  if (booking.mechanic_id !== mechanicId)
    return { ok: false as const, error: "This isn't your job." };
  return { ok: true as const, booking, admin };
}

function revalidate(bookingId: string) {
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath(`/book/confirmed/${bookingId}`);
}

/** Upload one job photo. Allowed while the job is confirmed / en route / in progress. */
export async function uploadJobPhoto(
  bookingId: string,
  formData: FormData,
): Promise<JobMediaResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No photo selected." };
  if (file.size > MAX_PHOTO_BYTES)
    return { ok: false, error: "Photo must be 10 MB or smaller." };
  const ext = ALLOWED_PHOTO_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP image." };

  const res = await ownedBooking(bookingId, guard.mechanicId);
  if (!res.ok) return res;
  const { booking, admin } = res;
  if (!PHOTO_STATUSES.includes(booking.status))
    return { ok: false, error: "Photos can only be added to an active job." };

  const path = `${bookingId}/photo-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("job-media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: rowErr } = await admin.from("booking_media").insert({
    booking_id: bookingId,
    mechanic_id: guard.mechanicId,
    kind: "photo",
    storage_path: path,
  });
  if (rowErr) return { ok: false, error: rowErr.message };

  revalidate(bookingId);
  const {
    data: { publicUrl },
  } = admin.storage.from("job-media").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

/** Remove a job photo the mechanic uploaded. */
export async function deleteJobPhoto(mediaId: string): Promise<JobMediaResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: media } = await admin
    .from("booking_media")
    .select("id, booking_id, mechanic_id, kind, storage_path")
    .eq("id", mediaId)
    .single();
  if (!media) return { ok: false, error: "That photo no longer exists." };
  if (media.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your photo." };

  await admin.storage.from("job-media").remove([media.storage_path]);
  const { error } = await admin.from("booking_media").delete().eq("id", mediaId);
  if (error) return { ok: false, error: error.message };

  revalidate(media.booking_id);
  return { ok: true };
}

/**
 * Save the customer's sign-off signature (a PNG exported from the on-screen
 * signature pad). Only valid while the job is in progress — it's the gate for
 * completion. One signature per job: we overwrite any previous one.
 */
export async function saveSignature(
  bookingId: string,
  formData: FormData,
): Promise<JobMediaResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "No signature captured." };
  if (file.type !== "image/png")
    return { ok: false, error: "Signature must be a PNG." };
  if (file.size > MAX_SIGNATURE_BYTES)
    return { ok: false, error: "Signature image is too large." };

  const res = await ownedBooking(bookingId, guard.mechanicId);
  if (!res.ok) return res;
  const { booking, admin } = res;
  if (booking.status !== "in_progress")
    return { ok: false, error: "Capture the signature once work is in progress." };

  const path = `${bookingId}/signature.png`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("job-media")
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  // One sign-off per job — replace any prior signature row.
  await admin
    .from("booking_media")
    .delete()
    .eq("booking_id", bookingId)
    .eq("kind", "signature");
  const { error: rowErr } = await admin.from("booking_media").insert({
    booking_id: bookingId,
    mechanic_id: guard.mechanicId,
    kind: "signature",
    storage_path: path,
  });
  if (rowErr) return { ok: false, error: rowErr.message };

  revalidate(bookingId);
  return { ok: true };
}
