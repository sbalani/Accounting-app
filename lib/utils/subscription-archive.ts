import type { createClient } from "@/lib/supabase/server";

// Do not unlink linked transactions here: changing a transaction fires the
// existing payment balance trigger, even when only subscription_id changes.
export async function archiveSubscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  id: string
): Promise<{ archived: boolean; error: { message: string } | null }> {
  const { data, error } = await supabase.from("subscriptions")
    .update({ archived_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  return { archived: Boolean(data), error };
}
