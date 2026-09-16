import type { Metadata } from "next";
import { safeCustomerNext } from "@/lib/safe-next";
import { AuthShell } from "../_components/auth-shell";
import { CustomerLoginForm } from "./_components/customer-login-form";

export const metadata: Metadata = {
  title: "Sign in | Book My Tech",
};

interface LoginPageProps {
  searchParams: Promise<{ created?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { created, next } = await searchParams;
  // Where they were heading before the gate stopped them, set by proxy.ts or by
  // a page that needs a session. Validated here as well as in the action, so a
  // hostile value never reaches the rendered form.
  const nextPath = safeCustomerNext(next);
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your account. We'll take you to the right place.">
      <CustomerLoginForm justCreated={created === "1"} next={nextPath} />
    </AuthShell>
  );
}
