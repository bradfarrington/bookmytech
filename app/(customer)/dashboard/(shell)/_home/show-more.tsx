"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/dashboard/ui";

// Holds back the rest of a long list behind one button. The hidden items are
// rendered on the server and passed in, so opening it costs no round-trip.
export function ShowMore({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <Button variant="ghost" full icon={ChevronDown} onClick={() => setOpen(true)}>
      {label}
    </Button>
  );
}
