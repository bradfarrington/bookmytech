import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";

// A mechanic's profile photo, shared by the website's server action
// (app/actions/mechanic-profile.ts) and the mechanic app's route handler
// (POST /api/mobile/v1/mechanic/avatar) — Task 70.
//
// `avatars` is a PUBLIC bucket, but the write and the `profiles.avatar_url`
// update both go through the service role: the object path is namespaced by
// mechanic id and upserted, so each mechanic keeps exactly one current avatar
// and nobody can write into anybody else's folder.
//
// Who the mechanic is is a PARAMETER, never derived here.

export const AVATARS_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type AvatarUploadResult = { ok: true; url: string } | MechanicRefusal;

export async function uploadAvatarFor(
  mechanicId: string,
  file: unknown,
): Promise<AvatarUploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return refuse("invalid", "Choose an image to upload.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return refuse("invalid", "Image must be 5 MB or smaller.");
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return refuse("invalid", "Use a JPG, PNG or WebP image.");

  const admin = createAdminClient();
  const path = `${mechanicId}/avatar.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from(AVATARS_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return refuse("failed", upErr.message);

  const {
    data: { publicUrl },
  } = admin.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  // Cache-bust so the new image shows immediately after a re-upload — the path
  // is stable, so without this the app and every browser keep the old bytes.
  const url = `${publicUrl}?v=${Date.now()}`;

  const { error: profErr } = await admin
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", mechanicId);
  if (profErr) return refuse("failed", profErr.message);

  return { ok: true, url };
}

/**
 * Remove every avatar object a mechanic could have (Task 70 deletion). The
 * extension is part of the path, so all three are attempted; missing keys are
 * not an error.
 */
export async function removeAvatarObjects(
  admin: ReturnType<typeof createAdminClient>,
  mechanicId: string,
): Promise<void> {
  const paths = Object.values(ALLOWED_TYPES).map((ext) => `${mechanicId}/avatar.${ext}`);
  const { error } = await admin.storage.from(AVATARS_BUCKET).remove(paths);
  if (error) console.error("[account/delete] avatar removal failed", mechanicId, error.message);
}
