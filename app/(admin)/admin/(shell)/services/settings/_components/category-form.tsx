"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createCategory, updateCategory } from "@/app/actions/categories";

export interface CategoryFormValues {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export interface CategoryFormProps {
  mode: "create" | "edit";
  defaultDisplayOrder: number;
  category?: CategoryFormValues;
}

const FIELD_LABEL =
  "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

export function CategoryForm({
  mode,
  defaultDisplayOrder,
  category,
}: CategoryFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [displayOrder, setDisplayOrder] = useState(
    String(category?.display_order ?? defaultDisplayOrder),
  );
  const [isActive, setIsActive] = useState(category?.is_active ?? true);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const fd = new FormData();
        fd.set("name", name);
        fd.set("description", description);
        fd.set("display_order", displayOrder);
        if (isActive) fd.set("is_active", "on");

        startTransition(async () => {
          const result =
            mode === "create"
              ? await createCategory(fd)
              : await updateCategory(category!.id, fd);

          if (result?.error) {
            setError(result.error);
            toast.error(result.error);
          }
        });
      }}
      className="space-y-6"
    >
      <Card className="space-y-5 p-6">
        <label className={FIELD_LABEL}>
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={pending}
            placeholder="e.g. Brakes"
            className={FIELD_INPUT}
          />
        </label>

        <label className={FIELD_LABEL}>
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={3}
            placeholder="Optional — internal note describing what this category covers."
            className={`${FIELD_INPUT} h-auto resize-y py-2.5`}
          />
        </label>

        <label className={FIELD_LABEL}>
          <span>Display order</span>
          <input
            type="number"
            min={0}
            step={1}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            disabled={pending}
            className={FIELD_INPUT}
          />
          <span className="text-xs font-normal text-text-muted">
            Lower numbers appear first in admin dropdowns.
          </span>
        </label>

        <label className="flex items-center gap-3 text-sm font-semibold text-text-primary">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={pending}
            className="size-4 rounded border-border accent-brand-blue"
          />
          <span>Active</span>
          <span className="text-xs font-normal text-text-muted">
            Inactive categories are hidden from new-service dropdowns. Existing
            services keep working.
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href="/admin/services/settings">
          <Button type="button" variant="ghost" disabled={pending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Create category"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
