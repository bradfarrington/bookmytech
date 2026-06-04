import type { Metadata } from "next";
import { AuthShell } from "../_components/auth-shell";
import { CustomerSignupForm } from "./_components/customer-signup-form";

export const metadata: Metadata = {
  title: "Create an account — Book My Tech",
};

interface SignupPageProps {
  // Pre-filled from the booking confirmation CTA (?name=&email=).
  searchParams: Promise<{ name?: string; email?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { name, email } = await searchParams;
  return (
    <AuthShell
      title="Create your account"
      subtitle="Track your booking live, message your mechanic, and rebook in a tap."
    >
      <CustomerSignupForm defaultName={name} defaultEmail={email} />
    </AuthShell>
  );
}
