import { SPECIALISMS } from "@/lib/specialisms";
import { ReviewStep } from "../_components/review-step";

export default function ReviewPage() {
  return <ReviewStep services={SPECIALISMS} />;
}
