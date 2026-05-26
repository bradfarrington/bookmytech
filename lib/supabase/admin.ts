import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client that bypasses RLS. Use sparingly — only for server-side
// reads/writes where row-level auth doesn't apply (e.g. a guest customer
// viewing their own just-created booking confirmation by id).
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
