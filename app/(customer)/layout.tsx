import { Toaster } from "sonner";

// Wraps every customer-facing route (landing, booking flow, dashboard). The
// admin shell mounts its own Toaster; the customer side gets this one so server
// actions on the confirmation page + dashboard can surface toasts.
export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster richColors position="top-right" closeButton />
    </>
  );
}
