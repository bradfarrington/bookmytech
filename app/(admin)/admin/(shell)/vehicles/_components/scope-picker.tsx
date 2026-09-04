"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, type SelectOption } from "@/components/ui/select";
import type { ExclusionScope } from "@/lib/haynespro/exclusions";

// "Apply changes to" picker on the admin model page's Repair times tab
// (Task 23). Model scope is the default and carries no param; global scope is
// ?scope=global. Everything else in the URL (tab, engine variant, the node
// being browsed and its breadcrumb trail) is kept, so switching scope never
// loses the admin's place in the tree.

const OPTIONS: ReadonlyArray<SelectOption<ExclusionScope>> = [
  { value: "model", label: "This model only" },
  { value: "global", label: "All vehicles" },
];

export function ScopePicker({ value }: { value: ExclusionScope }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: ExclusionScope) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "global") params.set("scope", "global");
    else params.delete("scope");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select
      value={value}
      onChange={handleChange}
      options={OPTIONS}
      aria-label="Apply changes to"
      className="w-44"
    />
  );
}
