import type { Metadata } from "next";
import { AuthShell } from "../_components/auth-shell";
import { CustomerLoginForm } from "./_components/customer-login-form";

export const metadata: Metadata = {
  title: "Sign in — Book My Tech",
};

interface LoginPageProps {
  searchParams: Promise<{ created?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { created } = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to track your bookings and rebook in a tap.">
      <CustomerLoginForm justCreated={created === "1"} />
    </AuthShell>
  );
}
