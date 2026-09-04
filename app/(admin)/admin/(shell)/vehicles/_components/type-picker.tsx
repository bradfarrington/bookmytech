"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, type SelectOption } from "@/components/ui/select";

// Engine-variant picker on the admin model page. Server components render the
// data for one type; picking another navigates to the same tab with ?type=…
// (drill-down params like the repair-tree node are reset — they're type-
// specific). The availability scope (Task 23) is kept: an admin editing "all
// vehicles" must not be dropped back into model scope by changing engine.

export function TypePicker({
  options,
  value,
}: {
  options: ReadonlyArray<SelectOption<string>>;
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams();
    const tab = searchParams.get("tab");
    if (tab) params.set("tab", tab);
    const scope = searchParams.get("scope");
    if (scope) params.set("scope", scope);
    params.set("type", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select
      value={value}
      onChange={handleChange}
      options={options}
      aria-label="Engine variant"
      className="w-full sm:w-96"
    />
  );
}
