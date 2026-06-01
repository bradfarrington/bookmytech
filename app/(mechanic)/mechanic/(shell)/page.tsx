import { redirect } from "next/navigation";

// The mechanic's home is the jobs feed. The invite magic-link also lands here
// (?next=/mechanic) and gets bounced straight to the dashboard.
export default function MechanicIndexPage() {
  redirect("/mechanic/jobs");
}
