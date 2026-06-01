import { Calendar } from "lucide-react";
import { MechanicPlaceholderPage } from "../_components/placeholder-page";

export default function MechanicSchedulePage() {
  return (
    <MechanicPlaceholderPage
      icon={Calendar}
      title="My schedule"
      description="A full calendar view of your confirmed jobs. A live daily timeline also runs alongside your jobs feed."
      comingIn="Task 05 Stage 3"
    />
  );
}
