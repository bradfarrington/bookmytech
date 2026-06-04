import { createClient } from "@/lib/supabase/server";
import { StepSpecialisms } from "../_components/step-specialisms";

export default async function Step3Page() {
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("slug, name")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  return <StepSpecialisms services={services ?? []} />;
}
