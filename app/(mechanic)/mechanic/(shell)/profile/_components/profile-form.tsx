"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { updateProfile, uploadAvatar } from "@/app/actions/mechanic-profile";

export interface ProfileFormProps {
  fullName: string;
  phone: string;
  bio: string;
  basePostcode: string | null;
  avatarUrl: string | null;
}

const FIELD =
  "w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted";

export function ProfileForm(props: ProfileFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(props.fullName);
  const [phone, setPhone] = useState(props.phone);
  const [bio, setBio] = useState(props.bio);
  const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl);

  function save() {
    startTransition(async () => {
      const res = await updateProfile({ fullName, phone, bio });
      if (res.ok) {
        toast.success("Profile saved.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("avatar", file);
    setUploading(true);
    (async () => {
      const res = await uploadAvatar(fd);
      setUploading(false);
      if (res.ok) {
        setAvatarUrl(res.url);
        toast.success("Photo updated.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
      if (fileRef.current) fileRef.current.value = "";
    })();
  }

  return (
    <Card className="space-y-6 p-6">
      {/* Photo */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={fullName || "Mechanic"} src={avatarUrl ?? undefined} size={72} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Change photo"
            className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-surface-card bg-brand-blue text-white shadow transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
          >
            <Camera size={13} />
          </button>
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">Profile photo</p>
          <p className="text-xs text-text-muted">
            {uploading ? "Uploading…" : "JPG, PNG or WebP, up to 5 MB."}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPickFile}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="full_name">
            Full name
          </label>
          <input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={FIELD}
            placeholder="Your name"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={FIELD}
            placeholder="07…"
          />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="bio">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          className={FIELD}
          placeholder="A short intro customers will see — experience, specialisms, anything that builds trust."
        />
      </div>

      {/* Base postcode — admin-locked */}
      <div>
        <label className={LABEL} htmlFor="base_postcode">
          Base postcode
        </label>
        <div className="flex items-center gap-2">
          <input
            id="base_postcode"
            value={props.basePostcode ?? "Not set"}
            readOnly
            className={`${FIELD} cursor-not-allowed bg-surface text-text-muted`}
          />
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-text-muted">
            <Lock size={12} /> Admin-set
          </span>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Your base postcode is locked. Contact support to request a change.
        </p>
      </div>

      <div className="flex justify-end border-t border-border-subtle pt-4">
        <Button onClick={save} disabled={pending}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}
