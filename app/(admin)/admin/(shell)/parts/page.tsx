import { redirect } from "next/navigation";

// The LKQ parts catalogue that lived here was removed with LKQ (Task 43,
// 2026-09-15). Alliance Automotive prices a repair's parts on the vehicle model
// page; this route only forwards old links to the supplier check page.

export default function AdminPartsPage() {
  redirect("/admin/parts/aag-check");
}
