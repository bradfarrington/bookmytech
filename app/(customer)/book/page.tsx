import { redirect } from "next/navigation";
import { BookEntry } from "./_components/book-entry";

interface BookPageProps {
  searchParams: Promise<{ reg?: string }>;
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const { reg } = await searchParams;

  // Deep links with a reg (e.g. from the homepage hero) skip the entry screen.
  if (reg) {
    redirect(`/book/vehicle?reg=${encodeURIComponent(reg)}`);
  }

  return <BookEntry />;
}
