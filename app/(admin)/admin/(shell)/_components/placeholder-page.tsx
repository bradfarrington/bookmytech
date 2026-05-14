import { Card } from "@/components/ui/card";
import { Overline } from "@/components/ui/overline";

export interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description?: string;
}

export function PlaceholderPage({
  eyebrow,
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Overline>{eyebrow}</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          {title}
        </h1>
      </header>
      <Card className="p-10 text-center">
        <p className="text-sm font-semibold text-text-secondary">Coming soon</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
          {description ??
            "This section will be built in a later task. The link is wired up so the sidebar stays navigable."}
        </p>
      </Card>
    </div>
  );
}
