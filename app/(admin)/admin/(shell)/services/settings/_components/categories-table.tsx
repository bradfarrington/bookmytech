"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import {
  deleteCategory,
  reorderCategory,
  setCategoryActive,
} from "@/app/actions/categories";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  service_count: number;
}

export interface CategoriesTableProps {
  categories: CategoryRow[];
}

export function CategoriesTable({ categories }: CategoriesTableProps) {
  if (categories.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-sm text-text-muted">
          No categories yet — add the first one.
        </p>
      </Card>
    );
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="grid grid-cols-[60px_minmax(0,1.4fr)_120px_120px_180px] gap-3 border-b border-border bg-surface px-5 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
        <div>Order</div>
        <div>Name</div>
        <div>In use</div>
        <div>Status</div>
        <div className="text-right">Actions</div>
      </div>

      {categories.map((category, index) => (
        <CategoryRowDisplay
          key={category.id}
          category={category}
          isFirst={index === 0}
          isLast={index === categories.length - 1}
        />
      ))}
    </Card>
  );
}

interface RowProps {
  category: CategoryRow;
  isFirst: boolean;
  isLast: boolean;
}

function CategoryRowDisplay({ category, isFirst, isLast }: RowProps) {
  const [pending, startTransition] = useTransition();

  const handleReorder = (direction: "up" | "down") => {
    startTransition(async () => {
      const result = await reorderCategory(category.id, direction);
      if (result?.error) toast.error(result.error);
    });
  };

  const handleToggleActive = () => {
    const next = !category.is_active;
    startTransition(async () => {
      const result = await setCategoryActive(category.id, next);
      if (result?.error) toast.error(result.error);
      else
        toast.success(
          next ? "Category reactivated." : "Category deactivated.",
        );
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete "${category.name}"? This permanently removes it. Services using this category must be reassigned first.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteCategory(category.id);
      // On success the action redirects with ?flash=category-deleted —
      // failure path returns an error we toast inline.
      if (result?.error) toast.error(result.error);
    });
  };

  return (
    <div
      className={cn(
        "grid grid-cols-[60px_minmax(0,1.4fr)_120px_120px_180px] items-center gap-3 border-b border-border-subtle px-5 py-3.5 text-sm last:border-b-0",
        !category.is_active && "opacity-60",
        pending && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex items-center gap-1 text-text-muted">
        <span className="w-6 font-mono text-xs">{category.display_order}</span>
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
          {category.name}
        </div>
        <div className="truncate font-mono text-xs text-text-muted">
          {category.slug}
        </div>
      </div>

      <div className="text-sm text-text-secondary">
        {category.service_count}{" "}
        {category.service_count === 1 ? "service" : "services"}
      </div>

      <div>
        {category.is_active ? (
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
        <Link href={`/admin/services/settings/categories/${category.id}/edit`}>
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
          aria-label={category.is_active ? "Deactivate" : "Reactivate"}
          className="flex size-8 items-center justify-center rounded-button border border-border text-text-secondary transition-colors hover:bg-border-subtle disabled:opacity-50"
        >
          <Icon icon={category.is_active ? PowerOff : Power} size={14} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || category.service_count > 0}
          aria-label="Delete"
          title={
            category.service_count > 0
              ? "Reassign services off this category first"
              : "Delete category"
          }
          className="flex size-8 items-center justify-center rounded-button border border-border text-text-secondary transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:text-text-secondary"
        >
          <Icon icon={Trash2} size={14} />
        </button>
      </div>
    </div>
  );
}
