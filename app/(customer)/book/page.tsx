import { redirect } from "next/navigation";
import { bookingStartNode } from "@/lib/bookings/start-node";
import { BookEntry } from "./_components/book-entry";

interface BookPageProps {
  searchParams: Promise<{ reg?: string; node?: string }>;
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const { reg, node } = await searchParams;
  // A link that chose where to start (a homepage services card) keeps that
  // choice through the reg and vehicle steps. See lib/bookings/start-node.ts.
  const start = bookingStartNode(node);
  const nodeSuffix = start ? `&node=${encodeURIComponent(start.id)}` : "";

  // Deep links with a reg (e.g. from the homepage hero) skip the entry screen.
  if (reg) {
    redirect(`/book/vehicle?reg=${encodeURIComponent(reg)}${nodeSuffix}`);
  }

  return <BookEntry node={start?.id ?? null} />;
}
