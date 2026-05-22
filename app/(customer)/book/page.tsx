import { redirect } from "next/navigation";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { Button } from "@/components/ui/button";
import Form from "next/form";

interface BookPageProps {
  searchParams: Promise<{ reg?: string }>;
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const { reg } = await searchParams;

  if (reg) {
    redirect(`/book/vehicle?reg=${encodeURIComponent(reg)}`);
  }

  // No reg in URL — show a simple reg entry screen
  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-text-primary">
          Book a mechanic
        </h1>
        <p className="mt-2 text-text-secondary">
          Enter your registration to get started
        </p>
      </div>

      <Form action="/book/vehicle" className="flex flex-col gap-3">
        <RegPlateInput
          name="reg"
          required
          autoFocus
          aria-label="Vehicle registration"
        />
        <Button type="submit" variant="primary" size="lg" fullWidth>
          Get a price
        </Button>
      </Form>
    </div>
  );
}
