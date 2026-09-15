"use server";

import { markInboxAllRead, markInboxItemRead } from "@/lib/inbox/feed";
import { createClient } from "@/lib/supabase/server";

// The website's Inbox read state (Task 48, Task 52). Thin wrappers over
// lib/inbox/feed.ts, through the caller's own cookie client, so the database
// functions mark THEIR row and nobody else's. Both quietly do nothing before
// migration 0075 or without a session: read state is a nicety, never an error.

export async function markInboxRead(itemId: string): Promise<void> {
  if (typeof itemId !== "string") return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await markInboxItemRead(supabase, itemId);
}

export async function markAllInboxRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await markInboxAllRead(supabase);
}
