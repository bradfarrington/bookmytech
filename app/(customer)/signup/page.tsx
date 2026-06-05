import type { Metadata } from "next";
import { AuthShell } from "../_components/auth-shell";
import { CustomerSignupForm } from "./_components/customer-signup-form";

export const metadata: Metadata = {
  title: "Create an account — Book My Tech",
};

interface SignupPageProps {
  // Pre-filled from the booking confirmation CTA (?name=&email=). ?ref= carries
  // a referral code when arriving from a share link.
  searchParams: Promise<{ name?: string; email?: string; ref?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { name, email, ref } = await searchParams;
  return (
    <AuthShell
      title="Create your account"
      subtitle={
        ref
          ? "You've been referred — get £10 off your first booking when you sign up."
          : "Track your booking live, message your mechanic, and rebook in a tap."
      }
    >
      <CustomerSignupForm defaultName={name} defaultEmail={email} referralCode={ref} />
    </AuthShell>
  );
}
