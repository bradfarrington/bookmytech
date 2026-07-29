import type { Metadata } from "next";
import { AuthShell } from "../../_components/auth-shell";
import { CustomerSetPasswordForm } from "./_components/set-password-form";

export const metadata: Metadata = {
  title: "Set your password — Book My Tech",
};

// Customers land here from the "set a new password" link in a reset email (a
// recovery link redeemed in /auth/callback, which leaves them with a session).
export default function CustomerSetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="You're signed in — pick a password and you're back in."
    >
      <CustomerSetPasswordForm />
    </AuthShell>
  );
}
