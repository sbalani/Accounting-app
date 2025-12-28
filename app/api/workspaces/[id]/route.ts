import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, primary_currency } = await request.json();

  const updateData: any = {};
  if (name !== undefined) {
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
    }
    updateData.name = name.trim();
  }
  if (primary_currency !== undefined) {
    updateData.primary_currency = primary_currency;
  }

  // Check if user is owner of the workspace
  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json({ error: "Error checking workspace membership" }, { status: 500 });
  }

  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "Only owners can update workspaces" }, { status: 403 });
  }

  // Update workspace
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .update(updateData)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workspace });
}
