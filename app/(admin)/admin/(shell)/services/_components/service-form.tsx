"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { createService, updateService } from "@/app/actions/services";

export interface ServiceFormValues {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  starting_price_pence: number;
  display_order: number;
  is_active: boolean;
}

export interface CategoryOption {
  slug: string;
  name: string;
}

export interface ServiceFormProps {
  mode: "create" | "edit";
  defaultDisplayOrder: number;
  categories: CategoryOption[];
  service?: ServiceFormValues;
}

const FIELD_LABEL =
  "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

export function ServiceForm({
  mode,
  defaultDisplayOrder,
  categories,
  service,
}: ServiceFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(service?.name ?? "");
  const [category, setCategory] = useState<string>(
    service?.category ?? categories[0]?.slug ?? "",
  );
  const [description, setDescription] = useState(service?.description ?? "");
  const [priceInput, setPriceInput] = useState(
    service ? (service.starting_price_pence / 100).toFixed(2) : "",
  );
  const [displayOrder, setDisplayOrder] = useState(
    String(service?.display_order ?? defaultDisplayOrder),
  );
  const [isActive, setIsActive] = useState(service?.is_active ?? true);

  const categoryOptions = categories.map((c) => ({
    value: c.slug,
    label: c.name,
  }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const fd = new FormData();
        fd.set("name", name);
        fd.set("category", category);
        fd.set("description", description);
        fd.set("price", priceInput);
        fd.set("display_order", displayOrder);
        if (isActive) fd.set("is_active", "on");
        // Slug is derived server-side from name on create and preserved on edit

        startTransition(async () => {
          const result =
            mode === "create"
              ? await createService(fd)
              : await updateService(service!.id, fd);

          // On success the action redirects and this never resolves; only the
          // error path returns a value here.
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
            placeholder="e.g. Full Service"
            className={FIELD_INPUT}
          />
        </label>

        <div className={FIELD_LABEL}>
          <span>Category</span>
          <Select
            value={category}
            onChange={setCategory}
            options={categoryOptions}
            disabled={pending}
            aria-label="Category"
            placeholder="Select a category…"
          />
        </div>

        <label className={FIELD_LABEL}>
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={3}
            placeholder="Optional — appears alongside the service in the booking flow."
            className={`${FIELD_INPUT} h-auto resize-y py-2.5`}
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Starting price</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">
                £
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                required
                disabled={pending}
                placeholder="45.00"
                className={`${FIELD_INPUT} pl-8`}
              />
            </div>
            <span className="text-xs font-normal text-text-muted">
              Stored in pence. £45.99 → 4599.
            </span>
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
              Lower numbers appear first in the list and on the landing page.
            </span>
          </label>
        </div>

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
            Inactive services are hidden from customers but kept on file.
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
        <Link href="/admin/services">
          <Button type="button" variant="ghost" disabled={pending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Create service"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
