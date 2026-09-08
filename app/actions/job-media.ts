"use server";

import { revalidatePath } from "next/cache";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { ownedBooking } from "@/lib/mechanics/owned-booking";
import { createAdminClient } from "@/lib/supabase/admin";

export type JobMediaResult =
  | { ok: true; url?: string }
  | { ok: false; error: string };

// Mechanic-captured job evidence — photos of the work. Same trust model as
// job-progress.ts: verify the caller owns the job in an RLS-aware client, then
// write the Storage object + booking_media row via service-role (the ownership
// re-read is the shared `ownedBooking`).
//
// There was a customer signature here too, captured on the mechanic's screen
// and gating completion. Removed on the owner's instruction (Gareth via Brad,
// 2026-09-08): the mechanic's own confirmation is the record now, and it goes
// into the completion event. `booking_media.kind` still allows 'signature' so
// the PNGs already captured stay readable.

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
// Photos can be taken before and during the visit.
const PHOTO_STATUSES = ["confirmed", "en_route", "in_progress"];

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
