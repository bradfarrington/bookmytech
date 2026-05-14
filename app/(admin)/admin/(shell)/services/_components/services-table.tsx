"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Power,
  PowerOff,
} from "lucide-react";
import { reorderService, setServiceActive } from "@/app/actions/services";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { cn, formatPrice } from "@/lib/utils";

const ACTIVE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

type ActiveFilter = "all" | "active" | "inactive";

export interface CategoryOption {
  slug: string;
  name: string;
}

export interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  starting_price_pence: number;
  display_order: number;
  is_active: boolean;
}

export interface ServicesTableProps {
  services: ServiceRow[];
  categories: CategoryOption[];
}

export function ServicesTable({ services, categories }: ServicesTableProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const categoryNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.slug, c.name);
    return m;
  }, [categories]);

  const categoryFilterOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...categories.map((c) => ({ value: c.slug, label: c.name })),
    ],
    [categories],
  );

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (categoryFilter !== "all" && s.category !== categoryFilter)
        return false;
      if (activeFilter === "active" && !s.is_active) return false;
      if (activeFilter === "inactive" && s.is_active) return false;
      return true;
    });
  }, [services, categoryFilter, activeFilter]);

  const isFiltering = categoryFilter !== "all" || activeFilter !== "all";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-text-secondary">Category</span>
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categoryFilterOptions}
            aria-label="Filter by category"
            className="w-44"
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-text-secondary">Status</span>
          <Select
            value={activeFilter}
            onChange={setActiveFilter}
            options={ACTIVE_FILTER_OPTIONS}
            aria-label="Filter by status"
            className="w-36"
          />
        </div>

        <div className="ml-auto text-sm text-text-muted">
          {filtered.length} of {services.length}{" "}
          {services.length === 1 ? "service" : "services"}
        </div>
      </div>

      {/* Table */}
      <Card padded={false} className="overflow-hidden">
        <div className="grid grid-cols-[60px_minmax(0,1.4fr)_120px_100px_100px_140px] gap-3 border-b border-border bg-surface px-5 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
          <div>Order</div>
          <div>Name</div>
          <div>Category</div>
          <div className="text-right">Starting</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-text-muted">
            {isFiltering
              ? "No services match these filters."
              : "No services yet — add the first one."}
          </div>
        ) : (
          filtered.map((service, index) => (
            <ServiceRowDisplay
              key={service.id}
              service={service}
              categoryName={
                categoryNames.get(service.category) ?? service.category
              }
              isFirst={index === 0}
              isLast={index === filtered.length - 1}
            />
          ))
        )}
      </Card>
    </div>
  );
}

interface ServiceRowDisplayProps {
  service: ServiceRow;
  categoryName: string;
  isFirst: boolean;
  isLast: boolean;
}

function ServiceRowDisplay({
  service,
  categoryName,
  isFirst,
  isLast,
}: ServiceRowDisplayProps) {
  const [pending, startTransition] = useTransition();

  const handleReorder = (direction: "up" | "down") => {
    startTransition(async () => {
      const result = await reorderService(service.id, direction);
      if (result?.error) toast.error(result.error);
    });
  };

  const handleToggleActive = () => {
    const next = !service.is_active;
    startTransition(async () => {
      const result = await setServiceActive(service.id, next);
      if (result?.error) toast.error(result.error);
      else toast.success(next ? "Service reactivated." : "Service deactivated.");
    });
  };

  return (
    <div
      className={cn(
        "grid grid-cols-[60px_minmax(0,1.4fr)_120px_100px_100px_140px] items-center gap-3 border-b border-border-subtle px-5 py-3.5 text-sm last:border-b-0",
        !service.is_active && "opacity-60",
        pending && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex items-center gap-1 text-text-muted">
        <span className="w-6 font-mono text-xs">{service.display_order}</span>
        <button
          type="button"
          onClick={() => handleReorder("up")}
          disabled={pending || isFirst}
          aria-label="Move up"
          className="flex size-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-border-subtle disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon icon={ArrowUp} size={13} />
        </button>
        <button
          type="button"
          onClick={() => handleReorder("down")}
          disabled={pending || isLast}
          aria-label="Move down"
          className="flex size-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-border-subtle disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon icon={ArrowDown} size={13} />
        </button>
      </div>

      <div className="min-w-0">
        <div className="truncate font-semibold text-text-primary">
          {service.name}
        </div>
        <div className="truncate font-mono text-xs text-text-muted">
          {service.slug}
        </div>
      </div>

      <div>
        <Pill tone="neutral">{categoryName}</Pill>
      </div>

      <div className="text-right font-semibold text-text-primary">
        {formatPrice(service.starting_price_pence)}
      </div>

      <div>
        {service.is_active ? (
          <Pill tone="success" dot>
            Active
          </Pill>
        ) : (
          <Pill tone="neutral" dot>
            Inactive
          </Pill>
        )}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <Link href={`/admin/services/${service.id}/edit`}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            iconLeft={Pencil}
            disabled={pending}
          >
            Edit
          </Button>
        </Link>
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={pending}
          aria-label={service.is_active ? "Deactivate" : "Reactivate"}
          className="flex size-8 items-center justify-center rounded-button border border-border text-text-secondary transition-colors hover:bg-border-subtle disabled:opacity-50"
        >
          <Icon icon={service.is_active ? PowerOff : Power} size={14} />
        </button>
      </div>
    </div>
  );
}
