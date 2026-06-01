import { FileText } from "lucide-react";
import { MechanicPlaceholderPage } from "../_components/placeholder-page";

export default function MechanicDocumentsPage() {
  return (
    <MechanicPlaceholderPage
      icon={FileText}
      title="Documents"
      description="Upload and manage your insurance and trade documents for verification."
      comingIn="Task 07 — mechanic onboarding"
    />
  );
}
