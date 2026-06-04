import { createClient } from "@/lib/supabase/server";
import { ReviewStep } from "../_components/review-step";

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("slug, name")
    .eq("is_active", true);

  return <ReviewStep services={services ?? []} />;
}
