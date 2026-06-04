import Link from "next/link";
import Image from "next/image";
import { Toaster } from "sonner";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { ResubmitForm } from "./_components/resubmit-form";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-content items-center px-4 py-3">
          <Link href="/" aria-label="Book My Tech — home">
            <Image src="/logo-no-bg.png" alt="Book My Tech" width={120} height={32} className="h-8 w-auto" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">{children}</main>
      <Toaster richColors position="top-right" closeButton />
    </div>
  );
}

export default async function ResubmitPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let app: {
    id: string;
    full_name: string;
    needs_info_note: string | null;
    vat_registered: boolean;
  } | null = null;

  if (UUID_RE.test(token)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("mechanic_applications")
      .select("id, full_name, needs_info_note, vat_registered, status, resubmit_token")
      .eq("resubmit_token", token)
      .single();
    if (data && data.status === "needs_info") {
      app = {
        id: data.id,
        full_name: data.full_name,
        needs_info_note: data.needs_info_note,
        vat_registered: data.vat_registered,
      };
    }
  }

  if (!app) {
    return (
      <Shell>
        <Card className="space-y-3 p-8 text-center">
          <h1 className="text-xl font-extrabold text-text-primary">Link no longer valid</h1>
          <p className="text-sm text-text-secondary">
            This resubmission link has expired or has already been used. If you
            think this is a mistake, reply to the email we sent you.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-text-primary">
            A bit more needed, {app.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-text-secondary">
            Re-upload the documents below, then resubmit your application for review.
          </p>
        </div>

        {app.needs_info_note && (
          <Card className="bg-warning/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning">
              What we need
            </p>
            <p className="mt-1 text-sm text-text-primary">{app.needs_info_note}</p>
          </Card>
        )}

        <ResubmitForm token={token} vatRegistered={app.vat_registered} />
      </div>
    </Shell>
  );
}
