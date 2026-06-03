"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { uploadJobPhoto, deleteJobPhoto } from "@/app/actions/job-media";

export interface JobPhoto {
  id: string;
  url: string;
}

interface PhotoUploaderProps {
  bookingId: string;
  photos: JobPhoto[];
  // Uploads only make sense on an active job; on a finished/cancelled one the
  // photos are shown read-only.
  canEdit: boolean;
}

export function PhotoUploader({ bookingId, photos, canEdit }: PhotoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadJobPhoto(bookingId, fd);
      if (res.ok) {
        toast.success("Photo added.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(id: string) {
    setRemovingId(id);
    startTransition(async () => {
      const res = await deleteJobPhoto(id);
      if (res.ok) router.refresh();
      else toast.error(res.error);
      setRemovingId(null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="Job photo" className="size-full object-cover" />
            {canEdit && (
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={pending}
                aria-label="Remove photo"
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100 disabled:opacity-50"
              >
                {removingId === p.id ? "…" : <X size={14} />}
              </button>
            )}
          </div>
        ))}

        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface text-text-muted transition-colors hover:border-brand-blue hover:text-brand-blue disabled:opacity-50"
          >
            <Camera size={18} />
            <span className="text-[11px] font-medium">{pending ? "…" : "Add"}</span>
          </button>
        )}
      </div>

      {photos.length === 0 && !canEdit && (
        <p className="text-xs text-text-muted">No photos were added to this job.</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
