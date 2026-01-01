import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  // Get default merchants (is_default = true or workspace_id is null)
  // and workspace-specific merchants
  let query = supabase
    .from("merchants")
    .select("*")
    .or(`is_default.eq.true,workspace_id.eq.${workspaceId || "null"}`)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const { data: merchants, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ merchants });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { name } = await request.json();

  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }

  // Check if merchant already exists (case-insensitive)
  const { data: existingMerchant } = await supabase
    .from("merchants")
    .select("id, name")
    .or(`is_default.eq.true,workspace_id.eq.${workspaceId}`)
    .ilike("name", name.trim())
    .maybeSingle();

  if (existingMerchant) {
    // Return existing merchant instead of creating duplicate
    return NextResponse.json({ merchant: existingMerchant });
  }

  // Create new workspace-specific merchant
  const { data: merchant, error } = await supabase
    .from("merchants")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      is_default: false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ merchant });
}

