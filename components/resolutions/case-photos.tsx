// Evidence attached to a Get-help case (Task 69, `resolution_cases.photos`).
// Shown on the mechanic's and the admin's case pages. The URLs are public
// objects in `job-media` under cases/<uploader>/, validated when the case was
// raised. Renders nothing for a case without any — which is every case raised
// before the mechanic app could attach them.

export function CasePhotos({ photos }: { photos: string[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Evidence</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {photos.map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- evidence in the public job-media bucket, shown at thumbnail size */}
            <img src={url} alt="Evidence attached to this case" className="size-24 rounded-lg border border-border object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}
