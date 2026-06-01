import { Star } from "lucide-react";
import { MechanicPlaceholderPage } from "../_components/placeholder-page";

export default function MechanicReviewsPage() {
  return (
    <MechanicPlaceholderPage
      icon={Star}
      title="Reviews"
      description="Customer ratings and reviews from your completed jobs."
      comingIn="Task 11 — ratings & retention"
    />
  );
}
