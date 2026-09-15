"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/dashboard/ui";

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
      <span className="sm:hidden">Print</span>
      <span className="hidden sm:inline">Print or save as PDF</span>
    </Button>
  );
}
