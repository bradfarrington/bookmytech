import "server-only";
import { revalidatePath } from "next/cache";
import { ownedBooking } from "@/lib/mechanics/owned-booking";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";
import { createAdminClient } from "@/lib/supabase/admin";

// Mechanic-captured job evidence — photos of the work. Shared by the website's
// server actions (app/actions/job-media.ts) and the mechanic app's routes
// (POST …/mechanic/bookings/[id]/photos, …/mechanic/photos/[mediaId]/remove,
// Task 67). The caller resolves the mechanic; ownership is re-read here under
// the service role (`ownedBooking`), and the Storage object + booking_media row
// are written with it — `job-media` takes service-role uploads only (0011).
//
// There was a customer signature here too, captured on the mechanic's screen
// and gating completion. Removed on the owner's instruction (Gareth via Brad,
// 2026-09-08): the mechanic's own confirmation is the record now, and it goes
// into the completion event. `booking_media.kind` still allows 'signature' so
// the PNGs already captured stay readable.

export type JobPhotoUploadResult = { ok: true; id: string; url: string } | MechanicRefusal;
export type JobPhotoRemoveResult = { ok: true } | MechanicRefusal;

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_JOB_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
// Photos can be taken before and during the visit.
const PHOTO_STATUSES = ["confirmed", "en_route", "in_progress"];

function revalidate(bookingId: string) {
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath(`/book/confirmed/${bookingId}`);
}

/** Upload one job photo. Allowed while the job is confirmed / en route / in progress. */
export async function uploadJobPhotoFor(
  mechanicId: string,
  bookingId: string,
  file: unknown,
): Promise<JobPhotoUploadResult> {
  if (!(file instanceof File) || file.size === 0) return refuse("invalid", "No photo selected.");
  if (file.size > MAX_JOB_PHOTO_BYTES) return refuse("invalid", "Photo must be 10 MB or smaller.");
  const ext = ALLOWED_PHOTO_TYPES[file.type];
  if (!ext) return refuse("invalid", "Use a JPG, PNG or WebP image.");

  const res = await ownedBooking(bookingId, mechanicId);
  if (!res.ok) return res;
  const { booking, admin } = res;
  if (!PHOTO_STATUSES.includes(booking.status))
    return refuse("conflict", "Photos can only be added to an active job.");

  const path = `${bookingId}/photo-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("job-media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return refuse("failed", upErr.message);

  const { data: row, error: rowErr } = await admin
    .from("booking_media")
    .insert({
      booking_id: bookingId,
      mechanic_id: mechanicId,
      kind: "photo",
      storage_path: path,
    })
    .select("id")
    .single();
  if (rowErr || !row) return refuse("failed", rowErr?.message ?? "booking_media insert returned nothing");

  revalidate(bookingId);
  const {
    data: { publicUrl },
  } = admin.storage.from("job-media").getPublicUrl(path);
  return { ok: true, id: row.id as string, url: publicUrl };
}

/** Remove a job photo the mechanic uploaded. */
export async function deleteJobPhotoFor(mechanicId: string, mediaId: string): Promise<JobPhotoRemoveResult> {
  const admin = createAdminClient();
  const { data: media } = await admin
    .from("booking_media")
    .select("id, booking_id, mechanic_id, kind, storage_path")
    .eq("id", mediaId)
    .single();
  if (!media) return refuse("not_found", "That photo no longer exists.");
  if (media.mechanic_id !== mechanicId) return refuse("forbidden", "This isn't your photo.");

  await admin.storage.from("job-media").remove([media.storage_path]);
  const { error } = await admin.from("booking_media").delete().eq("id", mediaId);
  if (error) return refuse("failed", error.message);

  revalidate(media.booking_id);
  return { ok: true };
}
