import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { data: rule, error } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const {
    name,
    rule_type,
    match_field,
    match_value,
    category,
    ai_context,
    priority,
    is_active,
  } = await request.json();

  // Build update object
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (rule_type !== undefined) updateData.rule_type = rule_type;
  if (match_field !== undefined) updateData.match_field = match_field;
  if (match_value !== undefined) updateData.match_value = match_value;
  if (category !== undefined) updateData.category = category;
  if (ai_context !== undefined) updateData.ai_context = ai_context;
  if (priority !== undefined) updateData.priority = priority;
  if (is_active !== undefined) updateData.is_active = is_active;

  // Validation
  if (rule_type && !["exact_match", "contains", "ai_context"].includes(rule_type)) {
    return NextResponse.json({ error: "Invalid rule type" }, { status: 400 });
  }

  if (match_field && !["description", "merchant"].includes(match_field)) {
    return NextResponse.json({ error: "Invalid match field" }, { status: 400 });
  }

  const { data: rule, error } = await supabase
    .from("categorization_rules")
    .update(updateData)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("categorization_rules")
    .delete()
    .eq("id", params.id)
    .eq("workspace_id", workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

