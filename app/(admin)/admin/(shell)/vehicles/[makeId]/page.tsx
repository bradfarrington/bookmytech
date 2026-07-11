import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Overline } from "@/components/ui/overline";
import { getMakeWithModels } from "@/lib/haynespro/tree";

// Model grid for one make (Task 16 Stage E). Model tiles use HaynesPro's own
// car images (svgz — rendered by the browser via a plain <img>).

export const dynamic = "force-dynamic";

export default async function AdminVehicleMakePage({
  params,
}: {
  params: Promise<{ makeId: string }>;
}) {
  const { makeId } = await params;
  const id = Number.parseInt(makeId, 10);
  if (!Number.isFinite(id)) notFound();

  const make = await getMakeWithModels(id);
  if (!make?.name) notFound();

  const models = (make.subElements ?? []).filter((m) => m.id != null && m.name);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link
          href="/admin/vehicles"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
          aria-label="Back to all makes"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <Overline>Vehicles</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            {make.name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {models.length} model{models.length === 1 ? "" : "s"} covered by
            HaynesPro
          </p>
        </div>
      </header>

      {models.length === 0 && (
        <div className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
          No models found for this make.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {models.map((model) => (
          <Link
            key={model.id}
            href={`/admin/vehicles/${id}/${model.id}`}
            className="group flex flex-col gap-2 rounded-2xl border border-border bg-surface-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md"
          >
            <span className="flex h-24 items-center justify-center">
              {model.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={model.image}
                  alt=""
                  loading="lazy"
                  className="max-h-24 max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-text-muted">No image</span>
              )}
            </span>
            <span className="text-sm font-bold leading-tight text-text-primary">
              {model.name}
            </span>
            <span className="text-xs text-text-muted">
              {model.madeFrom ?? "?"} – {model.madeUntil ?? "now"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
