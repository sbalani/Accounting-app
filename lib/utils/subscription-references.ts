import { createClient } from "@/lib/supabase/server";

export async function subscriptionReferencesValid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  fields: Record<string, string | number | boolean | null>
): Promise<boolean> {
  if (typeof fields.payment_method_id === "string") {
    const { data, error } = await supabase.from("payment_methods").select("id")
      .eq("id", fields.payment_method_id).eq("workspace_id", workspaceId).maybeSingle();
    if (error || !data) return false;
  }
  for (const [key, table] of [["merchant_id", "merchants"], ["category_id", "transaction_categories"]] as const) {
    if (typeof fields[key] === "string") {
      const { data, error } = await supabase.from(table).select("id").eq("id", fields[key])
        .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`).maybeSingle();
      if (error || !data) return false;
    }
  }
  return true;
}
