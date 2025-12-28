import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  // Get default categories (is_default = true or workspace_id is null)
  // and workspace-specific categories
  let query = supabase
    .from("transaction_categories")
    .select("*")
    .or(`is_default.eq.true,workspace_id.eq.${workspaceId || "null"}`)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const { data: categories, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories });
}
